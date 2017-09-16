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
  var cachePath = this.cachePath();
  if (fs.existsSync(cachePath)) {
    console.log("returning "+this.id+" from cache");
    return fs.createReadStream(cachePath);
    // todo headers?
  } else {
    console.log("downloading "+this.id);
    var rs = this.requestDownload();
    var ws = fs.createWriteStream(cachePath);
    rs.pipe(ws);
    return rs;
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
    console.log(err);
  });
};

module.exports = File;
