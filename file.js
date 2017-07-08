var mydbx = require("./mydbx.js");
var pic = require("./pic.js");

function File(parent, meta, parts) {
  this.parent = parent;
  this.name = meta.name;
  this.dbxid = meta.id;
  this.id = parts.id;
  console.log("File "+this.id+" created");
}

module.exports = File;
