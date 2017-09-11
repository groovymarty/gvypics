var mydbx = require("./mydbx.js");
var pic = require("./pic.js");
var fs = require('fs');
var path = require('path');

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
}

module.exports = File;
