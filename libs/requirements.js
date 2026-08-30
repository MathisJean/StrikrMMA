
//Set up libraries
const http = require('http');
const os = require('os');

const fs = require('fs');
const path = require('path');

const express = require('express');
const expressLayouts = require("express-ejs-layouts");

const pool = require('./db');

const bcrypt = require('bcrypt');

const session = require("express-session");
const PgStore = require("connect-pg-simple")(session);

const user_session = require('./middleware/user_session.js');

const mailer = require('./mailer.js');

const { upload_cloudinary_image, delete_cloudinary_image } = require('./cloudinary.js');

//Export everything you want to reuse
module.exports = {
  http,
  os,
  fs,
  path,
  
  express,
  expressLayouts,
  
  pool,

  bcrypt,

  session,
  PgStore,

  user_session,

  mailer,

  upload_cloudinary_image,
  delete_cloudinary_image
};