import { GET, POST, PUT, PATCH, DELETE} from "./http_requests.js";

//Tabs
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
        document.getElementById(tab.dataset.tab).classList.add('active');
    });
});

document.addEventListener("DOMContentLoaded", () => {
    const fileInputs = document.querySelectorAll(".input_file");

    const setVideoThumbnail = (label, videoSrc, revoke = false) => {
        const video = document.createElement("video");
        video.src = videoSrc;
        video.muted = true;

        video.addEventListener("loadeddata", () => {
            const canvas = document.createElement("canvas");
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            label.style.backgroundImage = `url('${canvas.toDataURL()}')`;

            if(revoke) URL.revokeObjectURL(video.src);
        });
    };

    Array.from(fileInputs).forEach(input => {
        const div = input.closest('div');

        //Set thumbnail from existing video URL on page load
        if(input.dataset.src){
            setVideoThumbnail(div, input.dataset.src, false);
        }

        //Set thumbnail when user selects a new file
        input.addEventListener('change', () => {
            const file = input.files[0];
            if(!file) return;

            if(file.type.startsWith("video/")){
                const blobUrl = URL.createObjectURL(file);
                setVideoThumbnail(div, blobUrl, true);
            }
            else{
                //Image file
                const imgUrl = URL.createObjectURL(file);
                div.style.backgroundImage = `url('${imgUrl}')`;
            }
        });
    });

    //Setup badge counters
    const badges = Array.from(document.querySelectorAll('.badge'));
    const counters = Array.from(document.querySelectorAll('.counter'));

    badges.forEach((badge, index) => {
        badge.addEventListener('input', () => { update_counter(badge, counters[index]) });

        update_counter(badge, counters[index]);
    })
});

function update_counter(badge, counter){
    counter.textContent = `${badge.value.length} / ${badge.maxLength}`;
}  

const save_btn = document.getElementById("save-btn");

save_btn.addEventListener("click", async () => {
    try{
        //Create form
        const form_data = new FormData();

        //-- Profile Inputs --//

        const profile_inputs = Array.from(document.querySelectorAll(".profile-input"));
        const profile_data = [{}];

        profile_inputs.forEach(input => {
            if(input.type === "file"){
                if(input.files.length){
                    const file = input.files[0];
                    const key = input.name;
                    
                    input.value = ""; //Clear file inputs

                    form_data.append(key, file); //Send files        
                    profile_data[0][input.name] = key; //Store file key in JSON      
                }
                else{
                    profile_data[0][input.name] = null; //No files in input
                }
            }
            else{
                //Set character inputs to values
                profile_data[0][input.name] = input.value;
            }
        });

        //-- Highlight Inputs --//

        const highlight_items = Array.from(document.querySelectorAll(".video-upload"));
        const highlight_data = [];
        
        highlight_items.forEach((item, i) => {
            const inputs = Array.from(item.querySelectorAll(".highlight-input"));
            highlight_data[i] = {
                id: item.dataset.id || null,
                order_index: i
            };

            inputs.forEach(input => {
                if(input.type === "file"){
                    if(input.files.length){
                        const file = input.files[0];
                        const key = `${input.name}_${i}`;
                        
                        input.value = ""; //Clear file inputs

                        form_data.append(key, file); //Send files        
                        highlight_data[i][input.name] = key; //Store file key in JSON      
                    }
                    else{
                        highlight_data[i][input.name] = null; //No files in input
                    }
                }
                else{
                    //Set character inputs to values
                    highlight_data[i][input.name] = input.value;
                }
            });
        });

        //-- Event Inputs --//

        const event_items = Array.from(document.querySelectorAll(".timeline-item"));
        const event_data = [];

        event_items.forEach((item, i) => {
            const inputs = Array.from(item.querySelectorAll(".event-input"));
            event_data[i] = {
                id: item.dataset.id || null,
                order_index: i
            };

            inputs.forEach(input => {
                if(input.type === "file"){
                    if(input.files.length){
                        const file = input.files[0];
                        const key = `${input.name}_${i}`;
                        
                        input.value = ""; //Clear file inputs

                        form_data.append(key, file); //Send files        
                        event_data[i][input.name] = key; //Store file key in JSON      
                    }
                    else{
                        event_data[i][input.name] = null; //No files in input
                    }
                }
                else{
                    //Set character inputs to values
                    event_data[i][input.name] = input.value;
                }
            });
        });

        const payload = {
            id: USER_ID,
            users: profile_data,
            highlights: highlight_data,
            events: event_data
        };

        form_data.append("json", JSON.stringify(payload));

        await PATCH("/api/update", form_data);

        window.location.reload();
    }
    catch(err){
        console.error("Error saving data:", err);
    }
});

const video_text = document.querySelector('#video-section .prompt')

//Slideshow Function
const slideshow = document.querySelector('.slideshow');
let slides = Array.from(document.querySelectorAll('.slideshow div'));
let slide_index = null;

slides.forEach(slide => {
    slide.addEventListener("click", (event) => {
        go_to_slide(event.currentTarget);
    });
});

window.addEventListener('DOMContentLoaded', () => {
    //Initialise caroussel
    if(slides.length == 0){
        video_text.style.display = "block";
    }
    else{
        go_to_slide(slides[slides.length <= 1 ? 0 : 1])
    }
});

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
    
    let prev_drop_area = prev_slide.querySelector('.vid_drop_area');
    let next_drop_area = next_slide.querySelector('.vid_drop_area');
    let current_drop_area = current_slide.querySelector('.vid_drop_area');

    prev_drop_area && Object.assign(prev_drop_area.style, { visibility: "hidden" });
    next_drop_area && Object.assign(next_drop_area.style, { visibility: "hidden" });
    current_drop_area && Object.assign(current_drop_area.style, { visibility: "visible" });
}

//Add videos dynamically with remove button
document.getElementById('add-video-btn').addEventListener('click', () => {
    const container = document.getElementById('video-container');
    const div = document.createElement('div');
    div.className = 'video-upload';
    div.innerHTML = `
        <label class="vid_drop_area">
            <input type="file" name="video_url" class="input_file highlight-input" accept="video/*" hidden>
            <img id="vid_view" src="/svg/video.svg">
        </label>
        <button type="button" class="remove-btn"><img src="/svg/delete.svg"></button>
    `;

    container.appendChild(div);

    div.querySelectorAll('.remove-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if(div) div.remove();
        });
    });

    div.querySelector('.remove-btn').addEventListener('click', () => div.remove());
    div.querySelector('.file-icon').addEventListener('click', () => div.querySelector('input[type="file"]').click());
});

//Add timeline items dynamically with remove button
document.getElementById('add-timeline-btn').addEventListener('click', () => {
    const container = document.getElementById('timeline-container');
    const div = document.createElement('div');
    div.className = 'timeline-item';
    div.innerHTML = `
        <label>Title<input type="text" name="title" class="event-input"></label>
        <label>Description<input type="text" name="description" class="event-input"></label>

        <label class="img_drop_area" border-radius: 1rem;">
            <input type="file" name="img_url" class="input_file event-input" accept="image/*" hidden>

            <img id="img_view" src="/svg/image.svg">
        </label>

        <button type="button" class="remove-btn"><img src="/svg/delete.svg"></button>
    `;

    container.appendChild(div);
    
    div.querySelectorAll('.remove-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if(div) div.remove();
        });
    });
    div.querySelector('.remove-btn').addEventListener('click', () => div.remove());
    div.querySelector('.file-icon').addEventListener('click', () => div.querySelector('input[type="file"]').click());
});
