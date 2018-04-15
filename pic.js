//                parentBase    parentSfx  child          sep    comment
//                |1            |2         |3             |4     |5
var folderPat = /^([A-Za-z]+\d*)([A-Za-z]*)(\d*(?:\+\d+)*)([- ]*)(.*)/;
//                parentBase    parentSfx  child           type       z   num       ver           sep  commentExt
//                |1            |2         |3              |4         |5  |6        |7            |8     |9
var filePat   = /^([A-Za-z]+\d*)([A-Za-z]*)(\d*(?:\+\d+)*)-([A-Za-z]*)(0*)([1-9]\d*)([A-Za-z]{,2})([- ]*)(.*)/;

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
      // child number for sorting or 0 if no child string
      // note lastIndexOf returns -1 if not found, plus 1 gives 0 resulting in entire string
      num: parseInt(mr[3].substr(mr[3].lastIndexOf("+") + 1)) || 0,
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
    var idot = mr[9].lastIndexOf(".");
    if (idot < 0) {
      idot = mr[9].length;
    }
    var parts = {
      parent: (mr[1] + mr[2]).toUpperCase(),
      child: trimChild(mr),
      type: mr[4].toUpperCase(),
      zeros: mr[5],
      num: parseInt(mr[6]),
      ver: mr[7].toUpperCase(),
      sep: mr[8],
      comment: mr[9].substr(0, idot),
      ext: mr[9].substr(idot).toLowerCase(),
      what: "file"
    };
    if (parts.sep || !parts.comment) {
      parts.id = parts.parent + parts.child + "-" + parts.type + parts.num + parts.ver;
      return parts;
    }
  }
  return null;
}

function parse(name) {
  return parseFile(name) || parseFolder(name);
}

function stringify(x) {
  return typeof x === 'string' ? x : JSON.stringify(x);
}

function getErrorMessage(error) {
  if (error.message) {
    return stringify(error.message);
  } else if (error.error) {
    return stringify(error.error);
  } else {
    console.log(error);
    return "An error happened!";
  }
}

var eRanges = [{
  id: "EE001",
  name: "E001 to 199 - Marty, Jill, Jeff, Heidi",
  start: 1,
  end: 199
},{
  id: "EE200",
  name: "E200 to 379 - Pfeifle/Casterline",
  start: 200,
  end: 379
},{
  id: "EE380",
  name: "E380 to 499 - Sauser/Cochran",
  start: 380,
  end: 499
},{
  id: "EE500",
  name: "E500 to 549 - Ann, Linda, Jean",
  start: 500,
  end: 549
}];

module.exports = {
  parseFolder: parseFolder,
  parseFile: parseFile,
  parse: parse,
  getErrorMessage: getErrorMessage,
  eRanges: eRanges
};
