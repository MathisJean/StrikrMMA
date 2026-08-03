
//Set up libraries
const http = require('http');
const os = require('os');

const fs = require('fs');
const path = require('path');

const express = require('express');
const expressLayouts = require("express-ejs-layouts");

const { Pool } = require('pg');
const pool = new Pool({
	user: process.env.DB_USER,
	password: process.env.DB_PASSWORD,
	host: process.env.DB_HOST,
	database: process.env.DB_DATABASE,
	port: process.env.DB_PORT
});

const email_auth = require("../libs/email_auth");

const { serverside_encrypt, serverside_decrypt, http_encrypt } = require("../libs/encryption");

const session = require("express-session");
const PgStore = require("connect-pg-simple")(session);

//Export everything you want to reuse
module.exports = {
  http,
  os,
  fs,
  path,
  
  express,
  expressLayouts,
  
  pool,
  email_auth,

  serverside_encrypt,
  serverside_decrypt,
  http_encrypt,

  session,
  PgStore
};