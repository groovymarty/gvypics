var mydbx = require("./mydbx.js");
var pic = require("./pic.js");
var File = require("./file.js");

function Folder(parent, meta, parts) {
  this.parent = parent;
  this.name = meta.name;
  this.path = meta.path_lower;
  this.id = parts.id;
  this.folders = {};
  this.files = {};
  console.log("Folder "+this.id+" created");
}

Folder.prototype.update = function() {
  var self = this;
  var filesSeen = {};
  var foldersSeen = {};
  return mydbx.filesListFolder({path: this.path})
    .then(function(result) {
      return self.processListFolderResult(result, filesSeen, foldersSeen);
    })
    .then(function() {
      // clean up deleted files and folders
      var filesNotSeen = Object.keys(self.files).filter(function(id) {return !(id in filesSeen);});
      filesNotSeen.forEach(function(id) {
        console.log("File "+id+" deleted");
        delete self.files[id];
      });
      var foldersNotSeen = Object.keys(self.folders).filter(function(id) {return !(id in foldersSeen);});
      foldersNotSeen.forEach(function(id) {
        console.log("Folder "+id+" deleted");
        delete self.folders[id];
      });
      return true; //done
    })
    .catch(function(error) {
      console.log(error);
    });
};

Folder.prototype.processListFolderResult = function(result, filesSeen, foldersSeen) {
  var self = this;
  result.entries.forEach(function(entry) {
    if (entry['.tag'] === "folder") {
      var parts = pic.parseFolder(entry.name);
      if (parts) {
        foldersSeen[parts.id] = true;
        if (!(parts.id in self.folders)) {
          self.folders[parts.id] = new Folder(self, entry, parts);
        }
      } else {
        console.log("Skipping " + entry.name);
      }
    } else if (entry['.tag'] === "file") {
      var parts = pic.parseFile(entry.name);
      if (parts) {
        filesSeen[parts.id] = true;
        if (!(parts.id in self.files)) {
          self.files[parts.id] = new File(self, entry, parts);
        }
      } else {
        console.log("Skipping " + entry.name);
      }
    } else {
      console.log("Unknown .tag: "+entry['.tag']);
    }
  });
  if (result.has_more) {
    // return another promise to keep chain going
    return mydbx.fileListFolderContinue({cursor: result.cursor})
      .then(function(result) {
        return self.processListFolderResult(result);
      })
      .catch(function(error) {
        console.log(error);
      });
  }
  return true; //done
}

module.exports = Folder;
