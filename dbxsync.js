#!/usr/bin/env nodejs

// this script synchronizes videos from Dropbox to the Digital Ocean space
// periodically, it scans the Dropbox folders for videos
// the first scan is a complete scan of all files/folders in Dropbox,
// but subsequent scans use the continue feature to check for changes since last time.
// for each video found, it checks to see if the same video exists in the space
// if video is not there, or has changed, file is transferred from Dropbox to space
// change detection is based on Dropbox rev number, which is stored in metadata in space
// bucket name is "gvypics", key for each video is its groovymarty id
// TODO: implement deletion

var fs = require("fs");
var pic = require("./pic.js");
var File = require("./file.js");
var mydbx = require("./mydbx.js");
var aws = require("aws-sdk");
var request = require("request");

var options = JSON.parse(fs.readFileSync(".space-access-key"));
options.endpoint = new aws.Endpoint("nyc3.digitaloceanspaces.com");
var s3 = new aws.S3(options);

// this function does one complete polling cycle
// if no cursor specified start new iteration, otherwise start at specified cursor
// returns promise that returns cursor for next cycle
function updateFolder(path, cursor) {
	//console.log("polling...");
  
  // this function processes the result of fileListFolder or fileListFolderContinue
	// returns promise to process all videos found
	function processListFolderResult(result) {
		// chain for sequential execution of promises
		var chain = Promise.resolve(true);
		result.entries.forEach(function(entry) {
			var parts;
			if (entry['.tag'] === "folder") {
				parts = pic.parseFolder(entry.name);
				if (parts) {
						//console.log("found folder", parts.id);
				}
			} else if (entry['.tag'] === "file") {
				parts = pic.parseFile(entry.name);
				if (parts) {
					var tinfo = File.typeInfo[parts.type];
					if (tinfo) {
						var mime = tinfo.extToMime[parts.ext];
						if (mime) {
							// make sure file's id correctly predicts the folder it's in
							var pathParts = entry.path_lower.split("/");
							if (pathParts.length >= 2) {
								var lastFolder = pathParts[pathParts.length-2];
								// ignore folders that start with underscore
								if (!lastFolder.startsWith("_")) {
									var folderParts = pic.parseFolder(lastFolder);
									if (!folderParts ||
										folderParts.parent !== parts.parent ||
										folderParts.child !== parts.child) {
										console.log("***** Ignoring misplaced file: ", entry.path_display);
									} else {
										if (tinfo.name === 'video') {
											// add process video to promise chain
											chain = chain.then(function() {
												return processVideo(parts, entry, mime)
												  .catch(err => console.log("processVideo failed for "+parts.id, err));
											});
										}
									}
								}
							}
						}
					}
				}
			} else if (entry['.tag'] === "deleted") {
			} else {
				console.log("Unknown .tag: "+entry['.tag']);
			}
		});
		if (result.has_more) {
			// list folder is incomplete, request next batch
			chain = chain.then(function() {
				console.log("continuing...");
				return mydbx.filesListFolderContinue({cursor: result.cursor})
					.then(processListFolderResult);
			});
		} else {
			// list folder is complete, return next cursor as final result of promise chain
			chain = chain.then(function() {
				return result.cursor;
			});
		}
		return chain;
  }
	
	// if no cursor specified, start over with complete new iteration
	// else continue using cursor from last time
	return (!cursor ? mydbx.filesListFolder({path: path, recursive: true, include_deleted: false})
							    : mydbx.filesListFolderContinue({cursor: cursor}))
		.then(processListFolderResult);
}

// starting cursor can be specified on command line
// but most of the time it is blank, resulting in a complete new iteration for the first poll
let nextCursor = process.argv[2];
function setCursor(cursor) {nextCursor = cursor;}
function resetCursor(err) {console.log("resetting cursor", err); nextCursor = false;}

// this function is the main driver of the dbx sync process
// it calls updateFolder, updates the cursor, delays, then calls itself to repeat the process
function doUpdateFolder() {
	return updateFolder("/Pictures", nextCursor)
		.then(setCursor, resetCursor)
		.then(() => {
			if (nextCursor) {
				// this dbx request will block until change happens or timeout
				return mydbx.filesListFolderLongpoll({cursor: nextCursor, timeout: 30}).catch(() => 0);
			} else {
				// we don't have a cursor, so fixed delay then try again
				return setTimeout(30000);
			}
		})
		.then(doUpdateFolder);
}
doUpdateFolder();

// stolen from Dropbox SDK..
var charsToEncode = /[\u007f-\uffff]/g;

function httpHeaderSafeJson(args) {
  return JSON.stringify(args).replace(charsToEncode, function (c) {
    return '\\u' + ('000' + c.charCodeAt(0).toString(16)).slice(-4);
  });
}

// Request file download and return readable stream
// Note we roll our own request instead of using Dropbox SDK
// Dropbox SDK buffers the whole file and does not support streaming
function requestDownload(dbxid) {
  return request.post("https://content.dropboxapi.com/2/files/download", {
    headers: {
      "Authorization": "Bearer "+mydbx.getAccessToken(),
      "Dropbox-API-Arg": httpHeaderSafeJson({path: dbxid})
    }
  });
}

// this function processes one video file
// check metadata to see if we already have file, if so skip the file
// otherwise download from dbx to a temp file, then upload to space
// returns promise that's resolved when processing is complete or fails
function processVideo(parts, dbxmeta, mime) {
	// create promise to return to caller
	// internally we use callback functions in the classic node style
	var promResolve, promReject;
	var promise = new Promise((resolve, reject) => {
		promResolve = resolve;
		promReject = reject;
	});
	// get metadata for existing file, if any
	var params = {
		Bucket: "gvypics",
		Key: parts.id
	};
	s3.headObject(params, (err, data) => {
		// got metadata and it matches dropbox id and rev?
		if (!err && data && data.Metadata &&
				data.Metadata.dbxid === dbxmeta.id &&
				data.Metadata.dbxrev == dbxmeta.rev) {
			// yes, we can skip this file because we already have it
			console.log("skipping "+parts.id);
			promResolve(true);
		} else {
			// clean up temp file
			try {
				fs.unlinkSync("tmpfile");
			} catch (e) {}
			// download from dropbox to temp file
			// i know it would be more elegant to pipe the download directly to the upload,
			// without a temp file in between, but i couldn't get it work
			// using temp file is fine, this is not youtube!
			console.log("downloading "+parts.id);
			var rs = requestDownload(dbxmeta.id);
			var ws = fs.createWriteStream("tmpfile", {flags: "wx"});
			var somethingWentWrong = false;
			rs.pipe(ws);
			// event handlers
			rs.on('error', function(err) {
				console.log("download failed for "+parts.id, err);
				somethingWentWrong = true;
				rs.end();
				ws.end();
			});
			rs.on('stop', function() {
				console.log("download stopped for "+parts.id);
				somethingWentWrong = true;
				rs.end();
				ws.end();
			});
			ws.on('error', function(err) {
				console.log("write failed for "+parts.id, err);
				somethingWentWrong = true;
				rs.end();
				ws.end();
			});
			ws.on('unpipe', function() {
				console.log("unpipe for "+parts.id);
				somethingWentWrong = true;
				rs.end();
				ws.end();
			});
			// final event handler when download is complete or failed
			ws.on('close', function() {
				if (!somethingWentWrong) {
					// upload temp file to space
					console.log("ws closed for "+parts.id);
					var params = {
						Bucket: "gvypics",
						Key: parts.id,
						Body: fs.createReadStream("tmpfile"),
						ACL: "public-read",
						ContentType: mime.name,
						Metadata: {dbxid: dbxmeta.id, dbxrev: dbxmeta.rev}
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
				} else {
					promReject(false);
				}
			});
		}
	});
	return promise;
}
