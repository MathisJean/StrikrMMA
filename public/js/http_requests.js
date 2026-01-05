//----HTTP requests----//

//Internal request handler
const _request = async (method, resource, data = null) => {
    const is_form_data = data instanceof FormData;

    const config = {
        method: method
    };

    if(data !== null){
        if(is_form_data){
            config.body = data;
        }
        else{
            config.headers = {
                "Accept": "application/json",
                "Content-Type": "application/json"
            };

            config.body = JSON.stringify(data);
        }
    }

    const response = await fetch(resource, config);

    let body;
    try{
        body = await response.json();
    }
    catch{
        body = await response.text();
    }

    return{
        status: response.status,
        ok: response.ok,
        ...(
            typeof body === "object"
            ? body
            : { error: body }
        )
    };
};

//GET data from resource
export const GET = async (resource) => {
    return await _request("GET", resource);
}

//POST data to resource
export const POST = async (resource, data) => {
    return await _request("POST", resource, data);
}

//PUT data to resource
export const PUT = async (resource, data) => {
    return await _request("PUT", resource, data);
}

//PATCH data to resource
export const PATCH = async (resource, data) => {
    return await _request("PATCH", resource, data);
}

//DELETE data to resource
export const DELETE = async (resource, data) => {
    return await _request("DELETE", resource, data);
}
