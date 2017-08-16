//                parent                 child            sep    comment
//                |                      |                |      |
var folderPat = /^([A-Za-z]+\d*[A-Za-z]*)(_?\d*(?:\+\d+)*)([- ]*)(.*)/;
//                parent                 child             type       z   num       sep    cmnt   ext
//                |                      |                 |          |   |         |      |      |
var filePat   = /^([A-Za-z]+\d*[A-Za-z]*)(_?\d*(?:\+\d+)*)-([A-Za-z]*)(0*)([1-9]\d*)([- ]*)([^.]*)(.*)/;

function cleanup(parts, name) {
  //mhs temp until underscore usage eliminated
  if (parts.child.startsWith("_")) {
    console.log("***** Has underscore: "+name);
    parts.child = parts.child.substr(1);
  }
  // leading plus unnecessary if parent ends with letter
  if (parts.child.startsWith("+") && isNaN(parts.parent.substr(-1))) {
    console.log("***** Extra plus: "+name);
    parts.child = parts.child.substr(1);
  }
}

function parseFolder(name) {
  var mr = name.match(folderPat);
  if (mr) {
    var parts = {
      parent: mr[1].toUpperCase(),
      child: mr[2],
      sep: mr[3],
      comment: mr[4],
      what: "folder"
    };
    if (parts.sep || !parts.comment) {
      cleanup(parts, name);
      parts.id = parts.parent + parts.child;
      return parts;
    }
  }
  return null;
}

function parseFile(name) {
  var mr = name.match(filePat);
  if (mr) {
    var parts = {
      parent: mr[1].toUpperCase(),
      child: mr[2],
      type: mr[3].toUpperCase(),
      zeros: mr[4],
      num: mr[5],
      sep: mr[6],
      comment: mr[7],
      ext: mr[8].toLowerCase(),
      what: "file"
    };
    if (parts.sep || !parts.comment) {
      cleanup(parts, name);
      parts.id = parts.parent + parts.child + "-" + parts.type + parts.num;
      return parts;
    }
  }
  return null;
}

function parse(name) {
  return parseFile(name) || parseFolder(name);
}

module.exports = {
  parseFolder: parseFolder,
  parseFile: parseFile,
  parse: parse
};
