//Slideshow Function
const slideshow = document.querySelector('.slideshow');
let slides = Array.from(document.querySelectorAll('.slideshow video'));
let slide_index = null;

const showcase_div = document.querySelector('.showcase');
/*
const highlights_radio = document.querySelector('#tab1');
const highlights_div = document.querySelector('#highlights');
const highlights_text = document.querySelector('#highlights .prompt')

const awards_radio = document.querySelector('#tab2');
const awards_div = document.querySelector('#awards');
const awards_text = document.querySelector('#awards .prompt')

const event_content = document.querySelector(".media-content");
const awards = Array.from(document.querySelectorAll('.event'));
const event_radio = Array.from(document.querySelectorAll('.event input[type="radio"]'));
*/
//Get data from timeline awards
const media_data = JSON.parse(document.getElementById('media-data').textContent);

function calculate_age(date){
    if(!date) return null;

    const diff = Date.now() - new Date(date).getTime();
    return Math.abs(new Date(diff).getUTCFullYear() - 1970);
}

function format_height(total_inches){
    if(!total_inches) return null;

    const feet = Math.floor(total_inches / 12);
    const inches = total_inches % 12;

    return `${feet}'${inches}"`;
}

slides.forEach(slide => {
    slide.addEventListener("click", (event) => {
        event.preventDefault();

        go_to_slide(event.currentTarget);
    });
});

async function copy_link() {
  const current_url = window.location.href;

  if(navigator.clipboard && window.isSecureContext){
    try {
      await navigator.clipboard.writeText(current_url);
      show_error("Copied to clipboard", "", "");
      return;
    } catch (err) {
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
/*
window.addEventListener('DOMContentLoaded', () => {
    //Initialise caroussel
    if(slides.length == 0){
        highlights_text.style.display = "block";
    }
    else{
        go_to_slide(slides[slides.length <= 1 ? 0 : 1])
    }

    //Initialize showcase div
    showcase(); 

    if(awards.length == 0){
        event_content.style.display = "none";
        awards_text.style.display = "block";
    }
});

highlights_radio.addEventListener("click", () => {
    showcase()
});

awards_radio.addEventListener("click", () => {
    showcase();
});

function showcase(){
    const is_highlights = highlights_radio.checked;

    highlights_div.classList.toggle("active", is_highlights);
    awards_div.classList.toggle("active", !is_highlights);

    if(is_highlights){
        awards_div.style.transform = 'translateX(20%)';
        if(slide_index !== null) slides[slide_index].play();
    }
    else{        
        highlights_div.style.transform = 'translateX(-20%)';
        
        slides.forEach(slide => {slide.pause()});
    }

    // Background changes
    showcase_div.style.background = 
        is_highlights ? 
        `linear-gradient(to bottom right, rgba(255, 80, 80, 0.3), rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.5)), rgb(0, 1, 1)`
        :
		`linear-gradient(to bottom right, rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0.5), rgba(80, 120, 255, 0.5)), rgb(0, 1, 1)`;
}

//-- Highlights Div --//

function go_to_slide(element){
    const temp_index = slides.indexOf(element);
    if(slide_index === temp_index) return;

    //Determine slide direction
    let offset = slide_index < temp_index ? "100%" : "-100%";
    if(slide_index === 0 && temp_index === slides.length - 1) offset = "-100%";
    if(slide_index === slides.length - 1 && temp_index === 0) offset = "100%";

    slide_index = temp_index;

    //Clear the container
    slideshow.innerHTML = '';

    const current_slide = slides[slide_index];
    let prev_slide, next_slide;

    if(slides.length === 1){
        //Create placeholder slides with the same class as normal slides
        prev_slide = document.createElement("div");
        next_slide = document.createElement("div");
        prev_slide.className = current_slide.className;
        next_slide.className = current_slide.className;
        
        prev_slide.style.visibility = "hidden";
        next_slide.style.visibility = "hidden";
    }
    else if(slides.length === 2){
        //Create placeholder slides with the same class as normal slides
        if(slide_index == 0){
            next_slide = document.createElement("div");
            next_slide.className = current_slide.className;
            next_slide.style.visibility = "hidden";
    
            const nextIndex = (slide_index + 1) % slides.length;
            prev_slide = slides[nextIndex];
        }
        else if(slide_index == 1){
            prev_slide = document.createElement("div");
            prev_slide.className = current_slide.className;
            prev_slide.style.visibility = "hidden";
    
            const nextIndex = (slide_index + 1) % slides.length;
            next_slide = slides[nextIndex];
        }
    }
    else{
        const prevIndex = (slide_index - 1 + slides.length) % slides.length;
        const nextIndex = (slide_index + 1) % slides.length;
        prev_slide = slides[prevIndex];
        next_slide = slides[nextIndex];
    }

    //Initial transform
    prev_slide && (prev_slide.style.transform = `translateX(${offset})`);
    current_slide && (current_slide.style.transform = `translate(${offset}, 0)`);
    next_slide && (next_slide.style.transform = `translateX(${offset})`);

    //Append in order
    [prev_slide, current_slide, next_slide].forEach(slide => {
        if(slide) slideshow.appendChild(slide);
    });

    //Force reflow
    [prev_slide, current_slide, next_slide].forEach(slide => {
        if(slide) slide.offsetWidth;
    });

    //Final transforms and opacity
    prev_slide && Object.assign(prev_slide.style, { transform: "translateX(0%)", opacity: 0.5 });
    next_slide && Object.assign(next_slide.style, { transform: "translateX(0%)", opacity: 0.5 });
    current_slide && Object.assign(current_slide.style, { transform: "translate(0%, -10px)", opacity: 1 });

    //Autoplay handling
    [prev_slide, current_slide, next_slide].forEach(slide => {
        if(!slide || slide.tagName !== "VIDEO") return;

        if(slide === current_slide){
            slide.autoplay = true;
            slide.play();
        }
        else{
            slide.autoplay = false;
            slide.pause();
        }
    });
}

//-- Awards Div --//

let current_event_index = null;

//Every timeline event
event_radio.forEach((element, index) => {
    if(element.checked){
        current_event_index = index;

        show_event(index);

        //Get relevent data
        const data = media_data[index];

        event_content.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.3)), url(${data.img_url})`;
        event_content.querySelector("#media-title").textContent = data.title;
        event_content.querySelector("#media-subtitle").textContent = data.description;
    }

    element.addEventListener("change", () => {
        if(current_event_index == index) return; //Same button press

        //Scroll timeline to show awards
        show_event(index);
        
        //Get relevent data
        const data = media_data[index];

        if(data){
            //Determine scroll direction
            let t1 = current_event_index > index ? "100%" : "-100%";
            let t2 = current_event_index > index ? "-100%" : "100%";
            current_event_index = index;
            
            //Move content out of view
            event_content.style.transform = `translateY(${t1})`;
            event_content.style.opacity = 0;
            
            //Move content in view
            setTimeout(() => {
                //Change info and position
                event_content.style.transition = "none";
                event_content.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.3)), url(${data.img_url})`;
                event_content.querySelector("#media-title").textContent = data.title;
                event_content.querySelector("#media-subtitle").textContent = data.description;
                
                event_content.style.transform = `translateY(${t2})`;
                
                //Force layout
                event_content.offsetHeight;
                
                //Move in view
                event_content.style.transition = "transform 500ms ease, opacity 500ms ease";
                event_content.style.transform = "translateY(0%)";
                event_content.style.opacity = 1;
            }, 300);
        }
    });
});

function show_event(index){
    //Scroll downwards
    if(current_event_index < index){
        for(let i = index + 1; i >= index; i--){
            if(awards[i]){
                //Scroll vertically only
                awards[i].scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
                break;
            }
        }
        return;
    }

    //Scroll upwards
    else if(current_event_index > index){
        for(let i = index - 1; i <= index; i++){
            if(awards[i]){
                awards[i].scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
                break;
            }
        }
        return;
    }
}
*/