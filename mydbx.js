var fs = require('fs');
var Dropbox = require('dropbox');
var accessToken = fs.readFileSync(".dropbox-access-token", "utf8");
var mydbx = new Dropbox({ accessToken: accessToken });
module.exports = mydbx;
