#!/usr/bin/env nodejs

// this script is the reverse of spacesync.js
// this script synchronizes videos to local _hq folders from the Digital Ocean space
// intended for use on Windows computer, working directory should be My Pictures
// this script only downloads files (space to local computer)

// it scans the Pictures directory tree for video files inside _hq folders
// it builds a lookup table to map groovy ids to full directory names, for later use
// it then lists the space for vid/_hq objects
// for each of these, it sees if corresponding file exists on the local computer
// the local directory is determined by the groovy id in the object key
// the local file name and expected last mod time are stored in the object metadata
// if not found or not the same size or last mod time, file is downloaded from space
// after download, Windows file stats are updated with last mod timestamp

// the purpose of this script is to populate an empty computer with the _hq video files
// once this is done, routine normal syncing is handled by spacesync.js in the opposite
// direction (computer to space).
// it is not harmful to run this script if the files already exist
// if the files exist and they match the metadata parameters, nothing happens

var fs = require("fs");
var os = require("os");
var path = require("path");
var aws = require("aws-sdk");
var pic = require("./pic.js");

var spaceAccessKeyPath = path.join(os.homedir(), ".space-access-key");
var options = JSON.parse(fs.readFileSync(spaceAccessKeyPath));
options.endpoint = new aws.Endpoint("nyc3.digitaloceanspaces.com");
var s3 = new aws.S3(options);

// key = groovy ID of folder, value = directory path for that folder
var dirMap = {};

// array of vid/_hq keys to be processed
var hqKeys = [];

// scan local directories recursively
function scanDir(dirPath) {
  console.log("scanning", dirPath); 
  var dir = fs.opendirSync(dirPath);
  while (true) {
    var dirent = dir.readSync();
    if (!dirent) {
      break;
    }
    if (dirent.isDirectory()) {
      if (dirent.name != "." && dirent.name != ".." && !dirent.name.startsWith("_")) {
        const parts = pic.parseFolder(dirent.name);
        if (parts && parts.id) {
          const childDirPath = path.join(dirPath, dirent.name);
          dirMap[parts.id] = childDirPath;
          scanDir(childDirPath);
        } else {
          console.log("ignoring", dirent.name);
        }
      }
    }
  }
  dir.closeSync();
}

// make file path for given folder ID and filename
// create _hq directory if necessary
function makeFilePath(dirId, filename) {
  const dirPath = dirMap[dirId];
  if (dirPath) {
    const hqDirPath = path.join(dirPath, "_hq");
    if (!fs.existsSync(hqDirPath)) {
      console.log("making", hqDirPath);
      fs.mkdirSync(hqDirPath);
    }
    return path.join(hqDirPath, filename);
  } else {
    console.log("no local directory for", dirId, filename);
    return null;
  }
}

// list objects and add _hq video file keys to array
// when done call next, if error call fail
function listObjects(continuation, next, fail) {
  var params = {
    Bucket: "gvypics",
    Prefix: "vid/_hq/"
  };
  if (continuation) {
    params.ContinuationToken = continuation;
  }
  s3.listObjectsV2(params, (err, data) => {
    if (!err && data && data.Contents) {
      data.Contents.forEach(obj => {
        console.log("found", obj.Key);
        hqKeys.push(obj.Key);
      });
      if (data.IsTruncated && data.ContinuationToken) {
        listObjects(data.ContinuationToken, next, fail);
      } else {
        next();
      }
    } else {
      console.log("listObjectsV2 failed");
      fail();
    }
  });
}

// process _hq files in array
// return promise chain
function processHqFiles() {
  var chain = Promise.resolve(true);
  hqKeys.forEach(key => {
    // chain promises so they'll run sequentially
    // catch any error and keep going
    chain = chain.then(() => processHqFile(key).catch(() => {}));
  });
  return chain;
}

// process one _hq file
// if local file missing or does not match metadata, download from space to local file
// return promise
function processHqFile(key) {
  var promResolve, promReject;
  var promise = new Promise((resolve, reject) => {
    promResolve = resolve;
    promReject = reject;
  });
  // key is vid/_hq/id
  var id = key.split("/")[2];
  var parts = id && pic.parseFile(id);
  var dirId = parts && (parts.parent + parts.child);
  
  // get metadata
  var params = {
    Bucket: "gvypics",
    Key: key
  };
  s3.headObject(params, (err, data) => {
    // all paths from here must lead to promResolve() or promReject()
    var skip = true;
    if (!err && data && data.Metadata && data.Metadata.filename) {
      var filePath = makeFilePath(dirId, data.Metadata.filename);
      if (filePath) {
        if (fs.existsSync(filePath)) {
          var stats = fs.statSync(filePath);
          var mtimeMs = Math.round(stats.mtimeMs);
          // here is the change detection logic
          if (!data.Metadata.mtimems || data.Metadata.mtimems != mtimeMs) {
            console.log("time difference for", id, "local time is", mtimeMs,
                        "remote time is", data.Metadata.mtimems);
            skip = false;
          }
          else if (data.ContentLength != stats.size) {
            console.log("size difference for", id, "local size is", stats.size,
                        "remote size is", data.ContentLength);
            skip = false;
          }
        } else {
          // file doesn't exist
          console.log("local file doesn't exist for", id);
          skip = false;
        }
      } else {
        console.log("can't find local directory for", id);
      }
      if (skip) {
        console.log("skipping", id);
        promResolve(true);
      } else {
        console.log("downloading", key, "to", filePath);
        var params = {
          Bucket: "gvypics",
          Key: key
        };
        const request = s3.getObject(params);
        const ws = fs.createWriteStream(filePath);
        const pipe = request.createReadStream().pipe(ws);            
        pipe.on('finish', () => {
          console.log("download complete for", id);
          // set modification time to agree with metadata!
          var newTime = new Date(parseInt(data.Metadata.mtimems));
          fs.utimesSync(filePath, newTime, newTime);
          promResolve(true);
        });
        request.on('error', () => {
          console.log("download failed for", id);
          promReject(false);
        });
      }
    } else {
      console.log("failed to get metadata for", key);
      promReject(false);
    }
  });
  return promise;
}

scanDir(".");
listObjects(null,
  () => processHqFiles().then(() => console.log("done")),
  () => console.log("failed")
);
