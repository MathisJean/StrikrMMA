
const { v2: cloudinary } = require('cloudinary');

//Configure Cloudinary
cloudinary.config({
	cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
	api_key: process.env.CLOUDINARY_API_KEY,
	api_secret: process.env.CLOUDINARY_API_SECRET
});

/**
 * Uploads a file buffer to Cloudinary under the `strikr/profiles` folder.
 * @param {Buffer} file_buffer - Raw file bytes to upload.
 * @returns {Promise<object>|undefined} Cloudinary upload result, or undefined if no buffer was given.
 */
function upload_cloudinary_image(file_buffer){
	if(!file_buffer) return;

	return new Promise((resolve, reject) => {
		const stream = cloudinary.uploader.upload_stream(
			{ folder: "strikr/profiles" },
			(error, result) => {
				if(error) reject(error);
				else resolve(result);
			}
		);
		stream.end(file_buffer);
	});
}

/**
 * Derives a Cloudinary public_id from one of our secure URLs.
 * @param {string} image_url - Full Cloudinary secure URL.
 * @returns {string|undefined} The public_id, or undefined if the URL couldn't be parsed.
 */
function extract_public_id(image_url){
	if(!image_url) return;

	const parts = image_url.split("/upload/");
	if(parts.length < 2) return;

	let path = parts[1];

	if(!path.startsWith("v") && path.includes("/")){
		path = path.substring(path.indexOf("/") + 1);
	}

	//Remove version prefix
	const public_id_with_extension = path.replace(/^v\d+\//, "");

	//Remove file extension
	return public_id_with_extension.substring(0, public_id_with_extension.lastIndexOf("."));
}

/**
 * Deletes a previously-uploaded image or video from Cloudinary, derived from its secure URL.
 * Rejects on failure — callers that only want best-effort cleanup should catch and log.
 * @param {string} image_url - Full Cloudinary secure URL of the asset to delete.
 * @returns {Promise<object|undefined>} Cloudinary destroy result, or undefined if no URL was given.
 */
async function delete_cloudinary_image(image_url){
	const public_id = extract_public_id(image_url);
	if(!public_id) return;

	return await cloudinary.uploader.destroy(public_id);
}

module.exports = {
	upload_cloudinary_image,
	delete_cloudinary_image
}