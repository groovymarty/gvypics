var mydbx = require("./mydbx.js");

function Folder(parent, item) {
  this.parent = parent;
  this.name = item.name;
  this.path = item.path_lower;
  this.dbxId = item.id;
  this.folders = {};
  console.log("Folder "+this.name+" created");
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
      if (!(entry.id in self.folders)) {
        self.folders[entry.id] = new Folder(self, entry);
      }
    } else if (entry['.tag'] === "file") {
      // is a file
    } else {
      console.log("unknown .tag: "+entry['.tag']);
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
