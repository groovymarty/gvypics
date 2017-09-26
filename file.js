var fs = require('fs');
var path = require('path');
var request = require('request');
var mydbx = require("./mydbx.js");
var Cache = require("./cache.js");

var typeInfo = {
  "": {
    name: "picture",
    containerName: "pictures",
    cacheDirName: "pictures",
    cacheMaxFiles: 30,
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
    cacheMaxFiles: 5,
    extToMime: {
      ".mp4": {name: "video/mp4"},
      ".mov": {name: "video/quicktime"},
      ".avi": {name: "video/x-msvideo"},
      ".wmv": {name: "video/x-ms-wmv"},
      ".3gp": {name: "video/3gpp"}
    }
  }
};

var types = Object.keys(typeInfo);

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
    cacheMaxFiles: 100
    //cacheDir and cache added by makeCacheDir()
  },
  'md': {
    dbxsz: "w640h480",
    cacheDirName: "pic-md",
    cacheMaxFiles: 100
  },
  'lg': {
    dbxsz: "w1024h768",
    cacheDirName: "pic-lg",
    cacheMaxFiles: 100
  }
};

var sizes = Object.keys(sizeInfo);

// Info and mime objects for contents.json and meta.json files
var contentsInfo = {
  cacheDirName: "contents",
  cacheMaxFiles: 100
};

var contentsMime = {
  name: "application/json",
  tinfo: contentsInfo
};

var metaInfo = {
  cacheDirName: "meta",
  cacheMaxFiles: 100
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
  makeCacheDir(metaInfo);
}

function File(parent, meta, parts, mime) {
  this.parent = parent;
  this.name = meta.name;
  this.dbxid = meta.id;
  this.rev = meta.rev;
  this.id = parts.id;
  this.num = parts.num;
  this.mime = mime;
  //console.log("File "+this.id+" created");
}

File.prototype.represent = function() {
  return {
    name: this.name,
    id: this.id
  };
};

File.typeInfo = typeInfo;
File.types = types;
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
  fs.utimes(path, nowSec, nowSec);
}

// Return read stream for file
// If file is in cache return file stream, else request download
File.prototype.readStream = function() {
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
    rs= fs.createReadStream(cachePath);
    rs.on('error', function(err) {
      console.log("read failed with "+err.code+" for "+self.id+", cleaning up");
      cleanup({rs: 1});
    });
    rs.on('stop', function() {
      console.log("read "+self.id+" stopped, cleaning up");
      cleanup({rs: 1});
    });
  } else {
    //console.log(this.id+" not in cache, downloading");
    rs = this.requestDownload();
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
        fs.renameSync(cachePathTmp, cachePath);
        tinfo.cache.addFile(cacheFileName);
      }
    });
    rs.pipe(ws);
  }
  return rs;
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
        case "content-length":
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
          fs.unlink(pathTmp);
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

module.exports = File;
