var mydbx = require("./mydbx.js");
var fs = require('fs');
var path = require('path');
var request = require('request');

var typeInfo = {
  "": {
    name: "picture",
    containerName: "pictures",
    cacheDirName: "pictures",
    //cacheDir added later, see setCacheBaseDir()
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

var cacheBaseDir;

// Called at startup with cache base directory
// Create cache dirs for each type and store path in tinfo object
File.setCacheBaseDir = function(baseDir) {
  cacheBaseDir = baseDir;
  types.forEach(function(type) {
    var tinfo = typeInfo[type];
    tinfo.cacheDir = path.join(baseDir, tinfo.cacheDirName);
    if (!fs.existsSync(tinfo.cacheDir)) {
      fs.mkdirSync(tinfo.cacheDir);
    }
  });
};

// Return cache file path for this file
// Cache file name includes id and revision
File.prototype.cachePath = function() {
  return path.join(this.mime.tinfo.cacheDir, this.id+"_"+this.rev);
};

// Return read stream for file
// If file is in cache return file stream, else request download
File.prototype.readStream = function() {
  var self = this;
  var cachePath = this.cachePath();
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
    rs= fs.createReadStream(cachePath);
    rs.on('error', function() {
      console.log("read "+self.id+" failed, cleaning up");
      cleanup({rs: 1});
    });
    rs.on('stop', function() {
      console.log("read "+self.id+" stopped, cleaning up");
      cleanup({rs: 1});
    });
    //rs.on('end', function() {
    //  console.log("read "+self.id+" ended");
    //});
  } else {
    //console.log(this.id+" not in cache, downloading");
    rs = this.requestDownload();
    cachePathTmp = cachePath + "_tmp";
    ws = fs.createWriteStream(cachePathTmp, {flags: "wx"});
    rs.on('error', function() {
      console.log("download "+self.id+" failed, cleaning up");
      cleanup({all: 1});
    });
    rs.on('stop', function() {
      console.log("download "+self.id+" stopped, cleaning up");
      cleanup({all: 1});
    });
    //rs.on('end', function() {
    //  console.log("download "+self.id+" ended");
    //});
    ws.on('error', function(err) {
      // If two requests for same file collide, one will get EEXIST error
      // Ignore error and let the other request continue to write file
      if (err.code === "EEXIST") {
        console.log("ignoring EEXIST for "+cachePathTmp);
        cleanup({ws: 1});
      } else {
        console.log("write failed for "+cachePathTmp+", cleaning up");
        cleanup({ws: 1, tmp: 1});
      }
    });
    ws.on('unpipe', function() {
      console.log("unpipe for "+cachePathTmp+", cleaning up");
      cleanup({ws: 1, tmp: 1});
    });
    ws.on('finish', function() {
      if (!somethingWentWrong) {
        fs.renameSync(cachePathTmp, cachePath);
      }
    });
    //ws.on('end', function() {
    //  console.log("write "+cachePathTmp+" ended");
    //});
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
  var self = this;
  return request.post("https://content.dropboxapi.com/2/files/download", {
    headers: {
      "Authorization": "Bearer "+mydbx.getAccessToken(),
      "Dropbox-API-Arg": httpHeaderSafeJson({path: this.dbxid})
    }
  })
  .on('response', function(res) {
    // clean up headers that we won't want to pass along
    delete res.headers['dropbox-api-result'];
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

module.exports = File;
