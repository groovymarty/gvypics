var fs = require('fs');
var users = JSON.parse(fs.readFileSync(".users", "utf8"));
Object.keys(users).forEach(function(userId) {
  users[userId].userId = userId;
});
var sessions = {};

var sessionTimeoutMs = 6*60*60*1000; //6 hrs

var seed = Date.now() & 16777215;
function generateToken() {
  var x = Math.sin(seed) * 10000;
  seed += Date.now() & 16777215;
  return (x - Math.floor(x)).toString().substr(2);
}

function processLogin(userId, password) {
  deleteExpiredSessions();
  var user = users[userId];
  if (user && user.password === password) {
    var tok;
    do {
      tok = generateToken();
    } while (sessions[tok]);
    var session = {
      user: user,
      token: tok,
      loginTime : Date.now()
    };
    sessions[tok] = session;
    return tok;
  } else {
    return null;
  }
}

function processLogout(tok) {
  if (sessions[tok]) {
    delete sessions[tok];
  }
}

function validateToken(tok) {
  var session = sessions[tok];
  if (session) {
    if (Date.now() - session.loginTime > sessionTimeoutMs) {
      // session expired
      delete sessions[tok];
      return null;
    }
    // session valid
    return Object.assign({}, session.user, {password: ""});
  }
  // session not found
  return null;
}

function deleteExpiredSessions() {
  Object.keys(sessions).forEach(validateToken);
}

module.exports = {
  generateToken: generateToken,
  processLogin: processLogin,
  processLogout: processLogout,
  validateToken: validateToken
};
