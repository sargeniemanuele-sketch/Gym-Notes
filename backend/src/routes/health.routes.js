"use strict";

const { Router } = require("express");
const { getDbState } = require("../config/db");

const router = Router();

router.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "gym-notes-backend",
    db: getDbState(),
  });
});

module.exports = router;
