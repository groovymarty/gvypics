var fs = require('fs');
var readline = require('readline');

var journalFileName = "metajournal";
var cache = {};
var ws = null;
var journalTimer = null;

// add array of changes to journal and cache
function addChanges(user, chgs) {
  stopJournalTimer();
  startWriteJournal();
  chgs.forEach(function(chg) {
    if (typeof chg === 'object' && chg.id) {
      // remove id from chg object and apply to cache
      var id = chg.id;
      delete chg.id;
      applyToCache(id, chg);
      // put id back along with user ID and timestamp, and write to journal
      chg.id = id;
      chg.userId = user.userId;
      chg.ts = Date.now();
      writeJournal(chg);
    } else {
      console.log("Meta chg ignored, not an object or lacks id");
    }
  });
  flushJournal();
  startJournalTimer();
}

// apply change to cache
function applyToCache(id, chg) {
  if (!cache[id]) {
    cache[id] = {};
  }
  Object.assign(cache[id], chg);
}

// open journal file if not already open and start buffering
function startWriteJournal() {
  if (!ws) {
    ws = fs.createWriteStream(journalFileName, {flags:'a'});
    ws.on('error', function(err) {
      console.log(journalFileName+" write failed with "+err.code);
      stopJournalTimer();
      ws.end();
      ws = null;
    });
  }
  ws.cork();
}

// write a meta change to journal
function writeJournal(chg) {
  if (ws) {
    ws.write(JSON.stringify(chg) + "\n");
  }
}

// flush buffer to journal file
function flushJournal() {
  if (ws) {
    ws.uncork();
  }
}

// stop journal timer if it is running
function stopJournalTimer() {
  if (journalTimer) {
    clearTimeout(journalTimer);
    journalTimer = null;
  }
}

// start journal timer, close journal file after 60 seconds of inactivity
function startJournalTimer() {
  stopJournalTimer();
  journalTimer = setTimeout(function() {
    if (ws) {
      console.log("closing journal");
      ws.end();
      ws = null;
    }
  }, 60000);
}
 
// read journal and apply all changes to cache
function readJournal() {
  if (fs.existsSync(journalFileName)) {
    var lineNum = 1;
    var rl = readline.createInterface({
      input: fs.createReadStream(journalFileName),
      crlfDelay: Infinity
    });  
    rl.on('error', function(err) {
      console.log(journalFileName+" read failed with "+err.code);
    });
    rl.on('line', function(line) {
      try {
        var chg = JSON.parse(line);
        if (typeof chg === "object" && chg.id) {
          var id = chg.id;
          delete chg.id;
          delete chg.userId;
          delete chg.ts;
          applyToCache(id, chg);
        } else {
          console.log("Meta chg ignored, not an object or lacks id, line "+lineNum);
        }
      } catch (e) {
        console.log(journalFileName+" JSON parse error on line "+lineNum);
      }
      lineNum += 1;
    });
    rl.on('close', function() {
      console.log(journalFileName+ " read finished");
      console.log("meta change cache: "+(Object.keys(cache).length)+" entries");
    });
  } else {
    console.log(journalFileName+" not found, skipping");
  }
}

// build new metadata dictionary with specified ids from origMeta and change cache
function applyChanges(origMeta, ids) {
  // any id in change cache?
  if (ids.some(function(id) {
    return id in cache;
  })) {
    var result = {};
    ids.forEach(function(id) {
      if (id in cache || id in origMeta) {
        result[id] = Object.assign({}, origMeta[id], cache[id]);
      }
    });
    return result;
  } else {
    // no changes, return original object
    return origMeta;
  }
}

module.exports = {
  addChanges: addChanges,
  readJournal: readJournal,
  applyChanges: applyChanges
};
