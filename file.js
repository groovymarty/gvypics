var fs = require('fs');
var path = require('path');
var request = require('request');
var stream = require('stream');
var mydbx = require("./mydbx.js");
var Cache = require("./cache.js");
var ObjCache = require("./objcache.js");

var typeInfo = {
  "": {
    name: "picture",
    containerName: "pictures",
    cacheDirName: "pictures",
    cacheMaxFiles: 50,
    //cacheDir and cache added by makeCacheDir()
    extToMime: {
      ".jpg": {name: "image/jpeg"}, //tinfo pointer added below to each mime
      ".jpeg": {name: "image/jpeg"},
      ".gif": {name: "image/gif"},
      ".png": {name: "image/png"}
    }
  },
  "V": {
    name: "video",
    containerName: "videos",
    cacheDirName: "videos",
    cacheMaxFiles: 50,
    extToMime: {
      ".mpg": {name: "video/mpeg"},
      ".mpeg": {name: "video/mpeg"},
      ".mp4": {name: "video/mp4"},
      ".mov": {name: "video/quicktime"},
      ".avi": {name: "video/x-msvideo"},
      ".wmv": {name: "video/x-ms-wmv"},
      ".3gp": {name: "video/3gpp"},
      ".webm": {name: "video/webm"}
    }
  }
};

var types = Object.keys(typeInfo);

// Make a list of all container names, including "folders"
var containerNames = types.map(function(type) {
  return typeInfo[type].containerName;
});
containerNames.push("folders");

// Add tinfo pointer to each mime object
types.forEach(function(type) {
  var tinfo = typeInfo[type];
  Object.keys(tinfo.extToMime).forEach(function(ext) {
    tinfo.extToMime[ext].tinfo = tinfo;
  });
});

var sizeInfo = {
  'sm': {
    dbxsz: "w128h128",
    cacheDirName: "pic-sm",
    cacheMaxFiles: 1000
    //cacheDir and cache added by makeCacheDir()
  },
  'md': {
    dbxsz: "w640h480",
    cacheDirName: "pic-md",
    cacheMaxFiles: 1000
  },
  'lg': {
    dbxsz: "w1024h768",
    cacheDirName: "pic-lg",
    cacheMaxFiles: 1000
  }
};

var sizes = Object.keys(sizeInfo);

// Info and mime objects for contents.json and meta.json files
var contentsInfo = {
  name: "contents.json",
  cacheDirName: "contents",
  cacheMaxFiles: 1000,
  objTimeout: 60000
};

var contentsMime = {
  name: "application/json",
  tinfo: contentsInfo
};

var metaInfo = {
  name: "meta.json",
  cacheDirName: "meta",
  cacheMaxFiles: 1000,
  objTimeout: 60000
};

var metaMime = {
  name: "application/json",
  tinfo: metaInfo
};

var cacheBaseDir;

// Make cache directory and cache manager for specified info object
function makeCacheDir(info) {
  info.cacheDir = path.join(cacheBaseDir, info.cacheDirName);
  if (!fs.existsSync(info.cacheDir)) {
    fs.mkdirSync(info.cacheDir);
  }
  info.cache = new Cache(info.cacheDir, info.cacheMaxFiles);
}

// Make object cache
function makeObjCache(info) {
  info.objCache = new ObjCache(info.objTimeout);
}

// Called at startup with cache base directory
function setCacheBaseDir(baseDir) {
  cacheBaseDir = baseDir;
  types.forEach(function(type) {
    makeCacheDir(typeInfo[type]);
  });
  sizes.forEach(function(size) {
    makeCacheDir(sizeInfo[size]);
  });
  makeCacheDir(contentsInfo);
  makeObjCache(contentsInfo);
  makeCacheDir(metaInfo);
  makeObjCache(metaInfo);
}

function File(parent, dbxmeta, parts, mime) {
  this.parent = parent;
  this.name = dbxmeta.name;
  this.size = dbxmeta.size;
  this.dbxid = dbxmeta.id;
  this.rev = dbxmeta.rev;
  this.id = parts.id;
  this.num = parts.num;
  this.mime = mime;
  //console.log("File "+this.id+" created");
}

File.prototype.updateProperties = function(dbxmeta, mime) {
  this.name = dbxmeta.name;
  this.dbxid = dbxmeta.id;
  this.rev = dbxmeta.rev;
  this.mime = mime;
};

File.prototype.represent = function() {
  return {
    name: this.name,
    id: this.id
  };
};

File.typeInfo = typeInfo;
File.types = types;
File.containerNames = containerNames;
File.sizeInfo = sizeInfo;
File.sizes = sizes;
File.contentsMime = contentsMime;
File.metaMime = metaMime;
File.setCacheBaseDir = setCacheBaseDir;

// Return cache file name for this file
// Cache file name includes id and revision
File.prototype.cacheFileName = function() {
  return this.id+"_"+this.rev;
};

// Touch access time to indicate recent use
function touchFile(path) {
  var nowSec = Math.trunc(Date.now()/1000);
  fs.utimes(path, nowSec, nowSec, function (err) {
    if (err) {
      console.log("utimes failed for "+path);
    }
  });
}

// Adapted from https://github.com/stephenplusplus/range-stream
var Transform = stream.Transform;
function DoRange(options) {
  this.istart = options.start || 0;
  this.iend = (options.end + 1) || 0;
  this.bytesReceived = 0;
  this.lastByteFound = false;
  Transform.call(this, options);
}

// Crazy Javascript inheritance stuff..
var tmp = function() {};
tmp.prototype = Transform.prototype;
DoRange.prototype = new tmp();
DoRange.prototype.constructor = DoRange;

// Implement Transform that keeps only the specified byte range and throws away the rest
DoRange.prototype._transform = function(chunk, enc, next) {
  this.bytesReceived += chunk.length;

  if (!this.lastByteFound && this.bytesReceived >= this.istart) {
    if (this.istart - (this.bytesReceived - chunk.length) > 0) {
      chunk = chunk.slice(this.istart - (this.bytesReceived - chunk.length));
    }
    if (this.iend <= this.bytesReceived) {
      this.push(chunk.slice(0, chunk.length - (this.bytesReceived - this.iend)));
      this.lastByteFound = true;
    } else {
      this.push(chunk);
    }
  }
  next();
};

// Return read stream for file
// If file is in cache return file stream, else request download
File.prototype.readStream = function(options) {
  options = options || {};
  var self = this;
  var tinfo = this.mime.tinfo;
  var cacheFileName = this.cacheFileName();
  var cachePath = path.join(tinfo.cacheDir, cacheFileName);
  var cachePathTmp;
  var somethingWentWrong = false;
  var rs, ws;

  // all-purpose cleanup function
  function cleanup(what) {
    somethingWentWrong = true;
    if (what.all || what.rs) {
      try {
        rs.end();
      } catch(e) {}
    }
    if (what.all || what.ws) {
      try {
        ws.end();
      } catch (e) {}
    }
    if (what.all || what.tmp) {
      try {
        fs.unlinkSync(cachePathTmp);
      } catch (e) {}
    }
  }
  
  if (fs.existsSync(cachePath)) {
    //console.log(this.id+" found in cache");
    touchFile(cachePath);
    tinfo.cache.touchFile(cacheFileName);
    rs= fs.createReadStream(cachePath, options);
    rs.on('error', function(err) {
      console.log("read failed with "+err.code+" for "+self.id+", cleaning up");
      cleanup({rs: 1});
    });
    rs.on('stop', function() {
      console.log("read "+self.id+" stopped, cleaning up");
      cleanup({rs: 1});
    });
    return rs;
  } else {
    //console.log(this.id+" not in cache, downloading");
    rs = this.requestDownload();
    if (!options.start && (!options.end || options.end >= this.size - 1)) {
      // entire file requested, write to cache as it is read
      cachePathTmp = cachePath + "_tmp";
      ws = fs.createWriteStream(cachePathTmp, {flags: "wx"});
      rs.on('error', function(err) {
        console.log("download failed with "+err.code+" for "+self.id+", cleaning up");
        cleanup({all: 1});
      });
      rs.on('stop', function() {
        console.log("download "+self.id+" stopped, cleaning up");
        cleanup({all: 1});
      });
      ws.on('error', function(err) {
        // If two requests for same file collide, one will get EEXIST error
        // Ignore error and let the other request continue to write file
        if (err.code === "EEXIST") {
          console.log("ignoring EEXIST for "+cachePathTmp);
          cleanup({ws: 1});
        } else {
          console.log("write failed with "+err.code+" for "+cachePathTmp+", cleaning up");
          cleanup({ws: 1, tmp: 1});
        }
      });
      ws.on('unpipe', function() {
        console.log("unpipe for "+cachePathTmp+", cleaning up");
        cleanup({ws: 1, tmp: 1});
      });
      ws.on('close', function() {
        if (!somethingWentWrong) {
          try {
            fs.renameSync(cachePathTmp, cachePath);
            tinfo.cache.addFile(cacheFileName);
          } catch (e) {
            console.log("rename failed with "+e.code+" for "+cachePathTmp);
          }
        }
      });
      rs.pipe(ws);
      return rs;
    } else {
      // byte range requested, don't write to cache
      // TODO: figure out how to do both..
      var doRange = new DoRange(options);
      rs.pipe(doRange);
      return doRange;
    }
  }
};

// stolen from Dropbox SDK..
var charsToEncode = /[\u007f-\uffff]/g;

function httpHeaderSafeJson(args) {
  return JSON.stringify(args).replace(charsToEncode, function (c) {
    return '\\u' + ('000' + c.charCodeAt(0).toString(16)).slice(-4);
  });
}

// Request file download and return readable stream
// Note we roll our own request instead of using Dropbox SDK
// Dropbox SDK buffers the whole file and does not support streaming
File.prototype.requestDownload = function() {
  return request.post("https://content.dropboxapi.com/2/files/download", {
    headers: {
      "Authorization": "Bearer "+mydbx.getAccessToken(),
      "Dropbox-API-Arg": httpHeaderSafeJson({path: this.dbxid})
    }
  })
  .on('response', function(res) {
    // clean up headers that we won't want to pass along
    Object.keys(res.headers).forEach(function(name) {
      switch (name.toLowerCase()) {
        // keep only these
        //case "content-length":
        case "etag":
          break;
        default:
          delete res.headers[name];
      }
    });
  })
  .on('error', function(err) {
    console.log("from requestDownload post request", err);
  });
};

// Promise version of fs.readFile()
function readFilePromise(path) {
  return new Promise(function(resolve, reject) {
    fs.readFile(path, function(err, data) {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
}

// Write data to file, using a temporary file and renaming at end
// Action is asynchronous and cleans up after itself
function writeFileAsyncWithRename(path, data, callback) {
  var pathTmp = path + "_tmp";
  var somethingWentWrong = false;
  var cleanupTmpFile = true;
  var ws = fs.createWriteStream(pathTmp, {flags: "wx"});

  // what do to if something goes wrong
  ws.on('error', function(err) {
    somethingWentWrong = true;
    // if EEXIST another request must be writing same file, don't delete temp file
    if (err.code === "EEXIST") {
      console.log("ignoring EEXIST for "+pathTmp);
      cleanupTmpFile = false;
    } else {
      console.log("async write failed with "+err.code+" for "+pathTmp);
    }    
  });
  
  // what to do when write finishes
  ws.on('close', function() {
    if (!somethingWentWrong) {
      fs.renameSync(pathTmp, path); //success
      if (callback) {
        callback();
      }
    } else {
      // failure, cleanup our temp file
      if (cleanupTmpFile) {
        try {
          fs.unlinkSync(pathTmp);
        } catch (e) {}
      }
    }
  });
  
  // write the data, note stream is always ended here
  ws.end(data, 'binary');
}

// Get file from cache if possible, otherwise request the file and save in cache
File.prototype.getFromCacheOrRequest = function(info, doRequest) {
  var cacheFileName = this.cacheFileName();
  var cachePath = path.join(info.cacheDir, cacheFileName);
  if (fs.existsSync(cachePath)) {
    // return from cache, touch to indicate recent use
    touchFile(cachePath);
    info.cache.touchFile(cacheFileName);
    return readFilePromise(cachePath);
  } else {
    // not found in cache, request from dropbox
    return doRequest().then(function(result) {
      // write to cache (async)
      writeFileAsyncWithRename(cachePath, result.fileBinary, function() {
        info.cache.addFile(cacheFileName);
      });
      // return to caller without waiting for write to finish
      return result.fileBinary;
    });
  }
}

// Return picture thumbnail of specified size
// Assumes file is type picture
File.prototype.getThumbnail = function(size) {
  var self = this;
  var szinfo = sizeInfo[size];
  if (szinfo) {
    return this.getFromCacheOrRequest(szinfo, function() {
      return mydbx.filesGetThumbnail({
        path: self.dbxid,
        size: szinfo.dbxsz
      });
    });
  } else {
    throw new Error("Unknown size: "+size);
  }
};

// Return contents of file
// This function buffers and returns the entire file contents
// If you want a readable stream, use readStream()
File.prototype.getFile = function() {
  var self = this;
  return this.getFromCacheOrRequest(this.mime.tinfo, function() {
    return mydbx.filesDownload({path: self.dbxid});
  });
};

// Return JSON contents of file
// Assumes file is content.json or meta.json
File.prototype.getJson = function() {
  var self = this;
  var info = this.mime.tinfo;
  var cacheFileName = this.cacheFileName();
  var obj = info.objCache.lookup(cacheFileName);
  if (obj) {
    // found in object cache, resolve instantly
    return Promise.resolve(obj);
  } else {
    // get JSON contents and parse it
    return this.getFile().then(function(data) {
      try {
        obj = JSON.parse(data.toString());
      } catch (e) {
        throw new Error("Error parsing "+info.name+" in "+self.parent.id);
      }
      // add to object cache and return the parsed object
      return info.objCache.add(cacheFileName, obj);
    });
  }
};

module.exports = File;
