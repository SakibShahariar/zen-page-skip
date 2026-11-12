const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sourceDirectory = path.join(root, "src");
const entryPoint = path.join(root, "script.uc.js");
const modules = fs.readdirSync(sourceDirectory)
  .filter((name) => /^\d{2}-.+\.js$/.test(name))
  .sort();

if (modules.length === 0) {
  throw new Error("No ordered source modules found in src/");
}

const generated = modules
  .map((name) => fs.readFileSync(path.join(sourceDirectory, name), "utf8"))
  .join("");

if (process.argv.includes("--check")) {
  const current = fs.readFileSync(entryPoint, "utf8");
  if (current !== generated) {
    console.error("script.uc.js is out of date. Run: node scripts/build.js");
    process.exitCode = 1;
  } else {
    console.log("script.uc.js matches the ordered source modules.");
  }
} else {
  fs.writeFileSync(entryPoint, generated);
  console.log("Generated script.uc.js from " + modules.length + " source modules.");
}
