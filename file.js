var mydbx = require("./mydbx.js");
var pic = require("./pic.js");

var typeInfo = {
  "": {
    name: "picture",
    containerName: "pictures"
  },
  "V": {
    name: "video",
    containerName: "videos"
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

module.exports = File;
