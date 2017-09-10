var mydbx = require("./mydbx.js");
var pic = require("./pic.js");
var fs = require('fs');
var path = require('path');

var typeInfo = {
  "": {
    name: "picture",
    containerName: "pictures",
    cacheDirName: "pictures"
  },
  "V": {
    name: "video",
    containerName: "videos",
    cacheDirName: "videos"
  }
};

function File(parent, meta, parts) {
  this.parent = parent;
  this.name = meta.name;
  this.dbxid = meta.id;
  this.id = parts.id;
  this.num = parts.num;
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
