import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  validateApacheLicense,
  validatePackageLicense,
  validateReleaseTag,
  validateRequiredEntries,
  validateThirdPartyNotices,
  validateVersions
} from "../scripts/verify-release.mjs";

const license = await readFile(new URL("../LICENSE", import.meta.url));

test("accepts the canonical Apache-2.0 LICENSE and rejects mutations or BOM", () => {
  assert.equal(validateApacheLicense(license), "c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4");
  assert.throws(() => validateApacheLicense(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), license])), /BOM/);
  const changed = Buffer.from(license);
  changed[changed.indexOf(Buffer.from("Apache License"))] = "a".charCodeAt(0);
  assert.throws(() => validateApacheLicense(changed), /unmodified Apache License/);
  assert.throws(() => validateApacheLicense(Buffer.alloc(0)), /unmodified Apache License/);
});

test("requires non-empty third-party notices", () => {
  assert.doesNotThrow(() => validateThirdPartyNotices(Buffer.alloc(101, "x")));
  assert.throws(() => validateThirdPartyNotices(Buffer.alloc(0)), /missing or empty/);
});

test("requires consistent versions and a matching release tag", () => {
  assert.equal(validateVersions(["0.3.0", "0.3.0", "0.3.0"]), "0.3.0");
  assert.throws(() => validateVersions(["0.3.0", "0.3.1"]), /Version mismatch/);
  assert.throws(() => validateVersions(["0.3.0", undefined]), /Version mismatch/);
  assert.doesNotThrow(() => validateReleaseTag("v0.3.0", "0.3.0"));
  assert.throws(() => validateReleaseTag("release-0.3.0", "0.3.0"), /vX.Y.Z/);
  assert.throws(() => validateReleaseTag("v0.3.1", "0.3.0"), /does not match/);
});

test("requires Apache-2.0 package and lockfile metadata", () => {
  assert.doesNotThrow(() => validatePackageLicense(
    { license: "Apache-2.0" },
    { packages: { "": { license: "Apache-2.0" } } }
  ));
  assert.throws(() => validatePackageLicense({ license: "MIT" }, { packages: { "": { license: "Apache-2.0" } } }));
  assert.throws(() => validatePackageLicense({ license: "Apache-2.0" }, { packages: { "": { license: "MIT" } } }));
});

test("requires distribution metadata and conditional NOTICE", () => {
  const base = ["manifest.json", "LICENSE", "THIRD_PARTY_NOTICES.md"];
  assert.doesNotThrow(() => validateRequiredEntries(base, false));
  assert.throws(() => validateRequiredEntries(base.slice(0, 2), false), /THIRD_PARTY_NOTICES/);
  assert.throws(() => validateRequiredEntries(base, true), /NOTICE/);
  assert.doesNotThrow(() => validateRequiredEntries([...base, "NOTICE"], true));
  assert.throws(() => validateRequiredEntries([...base, "NOTICE"], false), /stale NOTICE/);
});
