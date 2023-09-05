var fs = require('fs');
var os = require('os');
var path = require('path');
var Dropbox = require('dropbox');
var accessTokenPath = path.join(os.homedir(), ".dropbox-access-token");
var accessToken = fs.readFileSync(accessTokenPath, "utf8");
var mydbx = new Dropbox.Dropbox({ accessToken: accessToken });
module.exports = mydbx;
