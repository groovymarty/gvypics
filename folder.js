var mydbx = require("./mydbx.js");
var pic = require("./pic.js");

function Folder(parent, meta, parts) {
  this.parent = parent;
  this.name = meta.name;
  this.path = meta.path_lower;
  this.id = parts.id;
  this.folders = {};
  console.log("Folder "+this.id+" created");
}

Folder.prototype.update = function() {
  var self = this;
  return mydbx.filesListFolder({path: this.path})
    .then(function(result) {
      return self.processListFolderResult(result);
    })
    .catch(function(error) {
      console.log(error);
    });
};

Folder.prototype.processListFolderResult = function(result) {
  var self = this;
  result.entries.forEach(function(entry) {
    if (entry['.tag'] === "folder") {
      var parts = pic.parseFolder(entry.name);
      if (parts) {
        if (!(parts.id in self.folders)) {
          self.folders[parts.id] = new Folder(self, entry, parts);
        }
      } else {
        console.log("Skipping " + entry.name);
      }
    } else if (entry['.tag'] === "file") {
      // is a file
    } else {
      console.log("Unknown .tag: "+entry['.tag']);
    }
  });
  if (result.has_more) {
    return mydbx.fileListFolderContinue({cursor: result.cursor})
      .then(function(result) {
        return self.processListFolderResult(result);
      })
      .catch(function(error) {
        console.log(error);
      });
  }
}

module.exports = Folder;
