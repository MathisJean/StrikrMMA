
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

const { v2: cloudinary } = require('cloudinary');

const user_session = require('./middleware/user_session.js');

//Configure Cloudinary
cloudinary.config({
	cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
	api_key: process.env.CLOUDINARY_API_KEY,
	api_secret: process.env.CLOUDINARY_API_SECRET
});

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

  cloudinary,

  user_session
};