const crypto = require('crypto');

const password = process.env.ENCRYPTION_PASSWORD;
if(!password) throw new Error("ENCRYPTION_PASSWORD not set");

const debug_mode = process.env.DEBUG_MODE === 'true' && process.env.NODE_ENV !== "production";

const SALT = process.env.ENCRYPTION_SALT || 'dev_stable_salt';
const KEY_LENGTH = 32;

//Master key from password + stable salt
const masterKey = crypto.scryptSync(password, SALT, KEY_LENGTH);

// --- Server-side encryption ---
function serverside_encrypt(data)
{
    const plaintext = JSON.stringify(data);

    //Generate a random IV per encryption
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    if(debug_mode)
    {
        console.log("Encrypting data:", data);
    }

    return JSON.stringify(
    {
        iv: iv.toString('hex'),
        content: encrypted.toString('hex'),
        tag: tag.toString('hex'),
        salt: SALT
    });
}

//-- Server-side decryption --//
function serverside_decrypt(encryptedData)
{
    try
    {
        const data = JSON.parse(encryptedData);

        const iv = Buffer.from(data.iv, 'hex');
        const content = Buffer.from(data.content, 'hex');
        const tag = Buffer.from(data.tag, 'hex');

        const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, iv);
        decipher.setAuthTag(tag);

        const decrypted = Buffer.concat([decipher.update(content), decipher.final()]);

        if(debug_mode)
        {
            console.log("Decrypted data:", JSON.parse(decrypted.toString('utf8')));
        }

        return JSON.parse(decrypted.toString('utf8'));
    }
    catch(err)
    {
        console.error("Decryption failed:", err);
        return null;
    }
}

//-- Hybrid encryption for HTTP transport --//
function http_encrypt(data, public_key)
{
    const aesKey = crypto.randomBytes(32);  //Session key
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
    const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    const encryptedAesKey = crypto.publicEncrypt(
        {
            key: public_key,
            oaepHash: "sha256",
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING
        },
        aesKey
    );

    if(debug_mode)
    {
        console.log("HTTP Encrypt debug:", {
            iv: iv.toString('hex'),
            tag: tag.toString('hex')
        });
    }

    return JSON.stringify(
    {
        data: {
            iv: iv.toString('hex'),
            content: encrypted.toString('hex'),
            tag: tag.toString('hex')
        },
        aes_key: encryptedAesKey.toString('base64')
    });
}

module.exports = { serverside_encrypt, serverside_decrypt, http_encrypt };
