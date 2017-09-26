function ObjCache(halfLifeMs) {
  var self = this;
  this.halfLifeMs = halfLifeMs;
  this.newItems = {};
  this.oldItems = {};
  
  // Aging function
  // Objects start in newItems and transfer to oldItems after one half life
  // If they're referenced during second half life, they move back to newItems and live on
  // Otherwise they're discarded after second half life
  // So minimum retention is one half life, max is two (after last reference)
  setInterval(function() {
    // discard old items, new items are now old
    self.oldItems = self.newItems;
    // clear new items
    self.newItems = {};
  }, halfLifeMs);
}

// Return requested item or null if not in cache
ObjCache.prototype.lookup = function(name) {
  var obj = this.newItems[name];
  if (!obj) {
    obj = this.oldItems[name];
    if (obj) {
      // move item from old to new
      this.newItems[name] = obj;
      delete this.oldItems[name];
    }
  }
  return obj || null;
};

// Add specified item to cache, return item
ObjCache.prototype.add = function(name, item) {
  this.newItems[name] = item;
  return item;
};

// Remove specified item from cache
ObjCache.prototype.remove = function(name) {
  delete this.newItems[name];
  delete this.oldItems[name];
};

module.exports = ObjCache;
