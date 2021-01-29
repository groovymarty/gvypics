#!/usr/bin/env nodejs

// this script synchronizes videos from local _hq folders to the Digital Ocean space
// intended for use on Windows computer, working directory should be My Pictures
// this script only uploads files (local computer to space)

// it scans the Pictures directory tree for video files inside _hq folders
// for each of these, it sees if corresponding file exists in gvypics space
// the key string is vid/_hq/ followed by groovy id of video file
// if not found or file has changed, new file is uploaded to space
// change detection is based on file size and last mod timestamp
// last mod timestamp is from the Windows file stats, and is stored with
// file in metadata in the space.  LastModified time from Digital Ocean is not used.
// original Windows file name is also stored in metadata

// why is this script needed, since we have the Dropbox backup process,
// and the dbxsync script which copies videos from dbx to the space?
// because the videos under _hq folders are too large to keep in Dropbox
// the Dropbox backup script (dboxscan.py) skips them
// so this script is needed to upload them directly from local folders to the space

// TODO: implement deletion.  meanwhile delete manually using CyberDuck or DO Manage Spaces

var fs = require("fs");
var os = require("os");
var path = require("path");
var aws = require("aws-sdk");
var pic = require("./pic.js");
var File = require("./file.js");

var spaceAccessKeyPath = path.join(os.homedir(), ".space-access-key");
var options = JSON.parse(fs.readFileSync(spaceAccessKeyPath));
options.endpoint = new aws.Endpoint("nyc3.digitaloceanspaces.com");
var s3 = new aws.S3(options);

var chain = Promise.resolve(true);

// scan directories recursively
function scanDir(dirPath) {
  console.log("scanning", dirPath); //mhs temp
  var dir = fs.opendirSync(dirPath);
  var isHq = path.basename(dirPath) == "_hq";
  while (true) {
    var dirent = dir.readSync();
    if (!dirent) {
      break;
    }
    if (dirent.isDirectory()) {
      if (dirent.name != "." && dirent.name != "..") {
        scanDir(path.join(dirPath, dirent.name));
      }
    } else if (isHq && dirent.isFile()) {
      processHqFile(dirPath, dirent.name);
    }
  }
  dir.closeSync();
}

// process a file under _hq folder
// if it is a video, get metadata for change detection
// if file exists and hasn't changed, skip it
// otherwise upload to space and save last mod time in metadata
// the first part of this function is synchronous
// when it needs to do something asynchronous, it adds a promise to
// the promise chain pointed to by the global variable "chain"
// this way the async activities are run serially (one at a time)
// there is no point in trying to do more than one big file upload at a time
function processHqFile(dirPath, name) {
  var filePath = path.join(dirPath, name);
  var stats = fs.statSync(filePath);
  var mtimeMs = Math.round(stats.mtimeMs);
  var parts = pic.parseFile(name);
  var tinfo = File.typeInfo[parts.type];
  var mime = tinfo && tinfo.extToMime[parts.ext];
  if (parts.id && mime) {
    console.log("found", parts.id);
    // add async action to promise chain, so they will be done serially
    chain = chain.then(() => {
      var promResolve, promReject;
      var promise = new Promise((resolve, reject) => {
        promResolve = resolve;
        promReject = reject;
      });
      // get metadata for existing file, if any
      const params = {
        Bucket: "gvypics",
        Key: "vid/_hq/"+parts.id
      };
      s3.headObject(params, (err, data) => {
        // got metadata?
        var same = true;
        if (!err && data && data.Metadata) {
          //console.log("data for", name, ":", data);
          // here is the change detection logic
          if (!data.Metadata.mtimems || data.Metadata.mtimems < mtimeMs) {
            console.log("time difference for", parts.id, ", local time is", mtimeMs,
                        "remote time is", data.Metadata.mtimems);
            same = false;
          }
          else if (data.ContentLength != stats.size) {
            console.log("size difference for", parts.id, ", local size is", stats.size,
                        "remote size is", data.ContentLength);
            same = false;
          }
          else if (!data.Metadata.filename || data.Metadata.filename != name) {
            console.log("filename difference for", parts.id, ", local is", name,
                        "remote is", data.Metadata.filename || "");
            same = false;
          }
        } else {
          // file doesn't exist
          console.log("failed to get metadata for", parts.id);
          same = false;
        }
        if (same) {
          console.log("skipping", parts.id);
          promResolve(true);
        } else {
          console.log("uploading "+parts.id);
          const params = {
            Bucket: "gvypics",
            Key: "vid/_hq/"+parts.id,
            Body: fs.createReadStream(filePath),
            ACL: "public-read",
            ContentType: mime.name,
            Metadata: {
              mtimems: ""+mtimeMs,  //metadata tags always lowercase
              filename: name
            }
          };
          s3.upload(params, err => {
            if (err) {
              console.log("upload failed for "+parts.id, err);
              promReject(false);
            } else {
              console.log("upload successful for "+parts.id);
              promResolve(true);
            }
          }).on('httpUploadProgress', evt => console.log(evt));
        }
      });
      // catch all failures to keep chain going
      return promise.catch(() => {});
    });
  } else {
    console.log("can't parse", name);
  }
}

scanDir(".");
chain.then(() => console.log("done"));
