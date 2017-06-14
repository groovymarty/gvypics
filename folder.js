var count=0;

function Folder(parent, item) {
  this.parent = parent;
  this.name = item.name;
  this.id = item.id;
  console.log("Folder "+this.name+" created");
}

module.exports = Folder;
