const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

test("package.json declares start and test scripts and a main entry", () => {
  const pkgPath = path.join(__dirname, "..", "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

  assert.equal(typeof pkg.main, "string");
  assert.equal(typeof pkg.scripts.start, "string");
  assert.equal(typeof pkg.scripts.test, "string");
});
