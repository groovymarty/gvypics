//                parentBase    parentSfx  child          sep    comment
//                |1            |2         |3             |4     |5
var folderPat = /^([A-Za-z]+\d*)([A-Za-z]*)(\d*(?:\+\d+)*)([- ]*)(.*)/;
//                parentBase    parentSfx  child           type       z   num       sep    commentExt
//                |1            |2         |3              |4         |5  |6        |7     |8
var filePat   = /^([A-Za-z]+\d*)([A-Za-z]*)(\d*(?:\+\d+)*)-([A-Za-z]*)(0*)([1-9]\d*)([- ]*)(.*)/;

// leading plus unnecessary if parent has suffix (and therefore ends with a letter)
function trimChild(mr) {
  if (mr[3].startsWith("+") && mr[2]) {
    console.log("***** Extra plus: "+mr[0]);
    return mr[3].substr(1);
  } else {
    return mr[3];
  }
}

function parseFolder(name) {
  var mr = name.match(folderPat);
  if (mr) {
    var parts = {
      parent: (mr[1] + mr[2]).toUpperCase(),
      child: trimChild(mr),
      sep: mr[4],
      comment: mr[5],
      what: "folder"
    };
    if (parts.sep || !parts.comment) {
      parts.id = parts.parent + parts.child;
      return parts;
    }
  }
  return null;
}

function parseFile(name) {
  var mr = name.match(filePat);
  if (mr) {
    // find last dot for extension
    // hard to do in regular expression because extension is optional
    var idot = mr[8].lastIndexOf(".");
    if (idot < 0) {
      idot = mr[8].length;
    }
    var parts = {
      parent: (mr[1] + mr[2]).toUpperCase(),
      child: trimChild(mr),
      type: mr[4].toUpperCase(),
      zeros: mr[5],
      num: parseInt(mr[6]),
      sep: mr[7],
      comment: mr[8].substr(0, idot),
      ext: mr[8].substr(idot).toLowerCase(),
      what: "file"
    };
    if (parts.sep || !parts.comment) {
      parts.id = parts.parent + parts.child + "-" + parts.type + parts.num;
      return parts;
    }
  }
  return null;
}

function parse(name) {
  return parseFile(name) || parseFolder(name);
}

function getErrorMessage(error) {
  if (error.message) {
    return error.message;
  } else if (error.error) {
    return error.error;
  } else {
    console.log(error);
    return "An error happened!";
  }
}

module.exports = {
  parseFolder: parseFolder,
  parseFile: parseFile,
  parse: parse,
  getErrorMessage: getErrorMessage
};
