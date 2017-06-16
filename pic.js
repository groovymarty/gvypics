var folderPat = /^([A-Z]+[0-9]*[A-Z]*)(_?[0-9]*)([- ]*)(.*)/;
var filePat = /^([A-Z]+[0-9]*[A-Z]*)(_?[0-9]*)-([A-Z]*)(0*)([1-9][0-9]*)([- ]*)([^.]*)(.*)/;

function parseFolder(name) {
  var result = name.match(folderPat);
  if (result) {
    result = {
      parent: result[1],
      child: result[2],
      sep: result[3],
      comment: result[4],
      what: "folder"
    };
    if (result.sep || !result.comment) {
      result.id = result.parent + result.child;
    } else {
      result = null;
    }
  }
  return result;
}

function parseFile(name) {
  var result = name.match(filePat);
  if (result) {
    result = {
      parent: result[1],
      child: result[2],
      type: result[3],
      zeros: result[4],
      num: result[5],
      sep: result[6],
      comment: result[7],
      ext: result[8],
      what: "file"
    };
    if (result.sep || !result.comment) {
      result.id = result.parent + result.child + "-" + result.type + result.num;
    } else {
      result = null;
    }
  }
  return result;
}

function parse(name) {
  return parseFile(name) || parseFolder(name);
}

module.exports = {
  parseFolder: parseFolder,
  parseFile: parseFile,
  parse: parse
};
