
async function copy_link(){
  const current_url = window.location.href;

  if(navigator.clipboard && window.isSecureContext){
    try{
		await navigator.clipboard.writeText(current_url);
		show_error("Copied to clipboard", "", "");
		return;
    }
	catch(err){
		console.error("Clipboard API failed:", err);
    }
  }

  try{
    const text_area = document.createElement("textarea");
    text_area.value = current_url;
    
    //Prevent scrolling to bottom on mobile
    text_area.style.position = "fixed";
    text_area.style.left = "-9999px";
    
    document.body.appendChild(text_area);
    text_area.focus();
    text_area.select();

    const successful = document.execCommand("copy");
    document.body.removeChild(text_area);

    if(successful){
      show_error("Copied to clipboard", "", "", false, false);
    }
	else{
      show_error("Failed to copy link", "", "", false);
    }
  }
  catch(err){
    console.error("Fallback copy failed:", err);
    show_error("Failed to copy link", "", "");
  }
}

