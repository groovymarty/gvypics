var pic = require("./pic.js");
var File = require("./file.js");
var Folder = require("./folder.js");

var root;

function setRootFolder(rootFolder) {
  root = rootFolder;
}

// find folder or file from parsed id
function findFolder(parts) {
  return root.findFolder(parts.parent, parts.child, true);
}

function findFile(folder, parts) {
  return folder.findFile(parts.id, parts.type, true);
}

function parseAndFindFolder(id) {
  var parts = pic.parseFolder(id);
  if (parts) {
    return findFolder(parts).then(function(folder) {
      return folder.possibleUpdate();
    });
  } else {
    throw new Error("Parse failed for "+id);
  }
}

function parseAndFindFile(id) {
  var parts = pic.parseFile(id);
  if (parts) {
    return findFolder(parts).then(function(folder) {
      return findFile(folder, parts);
    });
  } else {
    throw new Error("Parse failed for "+id);
  }
}

function parseAndFind(id) {
  var parts = pic.parse(id);
  if (parts) {
    if (parts.what === "folder") {
      return findFolder(parts).then(function(folder) {
        return folder.possibleUpdate();
      });
    } else if (parts.what === "file") {
      return findFolder(parts).then(function(folder) {
        return findFile(folder, parts);
      });
    } else {
      throw new Error("Can't handle what="+parts.what);
    }
  } else {
    throw new Error("Parse failed for "+id);
  }
}

module.exports = {
  setRootFolder: setRootFolder,
  findFolder: findFolder,
  findFile: findFile,
  parseAndFindFolder: parseAndFindFolder,
  parseAndFindFile: parseAndFindFile,
  parseAndFind: parseAndFind
};
