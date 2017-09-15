var mydbx = require("./mydbx.js");
var pic = require("./pic.js");
var fs = require('fs');
var path = require('path');
var request = require('request');

var typeInfo = {
  "": {
    name: "picture",
    containerName: "pictures",
    cacheDirName: "pictures",
    extToMime: {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".png": "image/png"
    }
  },
  "V": {
    name: "video",
    containerName: "videos",
    cacheDirName: "videos",
    extToMime: {
      ".mp4": "video/mp4",
      ".mov": "video/quicktime",
      ".avi": "video/x-msvideo",
      ".wmv": "video/x-ms-wmv",
      ".3gp": "video/3gpp"
    }
  }
};

function File(parent, meta, parts, mime) {
  this.parent = parent;
  this.name = meta.name;
  this.dbxid = meta.id;
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

var cacheBaseDir;

File.setCacheBaseDir = function(baseDir) {
  cacheBaseDir = baseDir;
  Object.keys(typeInfo).forEach(function(type) {
    var tinfo = typeInfo[type];
    tinfo.cacheDir = path.join(baseDir, tinfo.cacheDirName);
    if (!fs.existsSync(tinfo.cacheDir)) {
      fs.mkdirSync(tinfo.cacheDir);
    }
  });
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
    res.headers["Content-Type"] = self.mime;
    delete res.headers['dropbox-api-result'];
    Object.keys(res.headers).forEach(function(name) {
      if (name.toLowerCase().startsWith("x-")) {
        delete res.headers[name];
      }
    });
  })
  .on('error', function(err) {
    console.log(err);
  });
};

module.exports = File;
