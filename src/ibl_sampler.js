
import { ShaderCache } from './shader_cache.js';
//import { WebGl } from './webgl.js';


import iblFiltering from './shaders/ibl_filtering.frag';
import panoramaToCubeMap from './shaders/panorama_to_cubemap.frag';
import debugOutput from './shaders/debug.frag';
import fullscreenShader from './shaders/fullscreen.vert';


// How to use:
// set canvas/context in constructor
// init()  (set panorama image)
// filterAll()
// fetch texture IDs 

class iblSampler
{
    constructor(canvas)
    {
        this.canvas = canvas;
        this.gl = canvas.getContext('webgl2');
        this.shader = undefined; // current shader
        this.currentWidth = 0;
        this.currentHeight = 0;

        this.textureSize = 1024;

        this.inputImage = undefined;

        this.inputTextureID = undefined;
        this.cubemapTextureID = undefined;
        this.lambertianTextureID = undefined;
        this.ggxTextureID = undefined;
        this.sheenTextureID = undefined;

        this.framebuffer = undefined;

        const shaderSources = new Map();

        shaderSources.set("fullscreen.vert", fullscreenShader);
        shaderSources.set("panorama_to_cubemap.frag", panoramaToCubeMap);
        shaderSources.set("ibl_filtering.frag", iblFiltering);
        shaderSources.set("debug.frag", debugOutput);

        this.shaderCache = new ShaderCache(shaderSources);
         
        this.init();
        this.resize(canvas.clientWidth, canvas.clientHeight);

        this.status = 0;
    }

    /////////////////////////////////////////////////////////////////////
  
   
    loadTexture(src) 
    {

        var image = new Image();
        image.src = src;
        
        var texture = this.gl.createTexture();

        this.gl.bindTexture( this.gl.TEXTURE_2D,  texture);     
     
        var gl =   this.gl;

        image.onload =  function() 
        {
            gl.bindTexture(gl.TEXTURE_2D, texture); // as this function is asynchronus, another texture could be set in between
            gl.texImage2D( gl.TEXTURE_2D, 0,  gl.RGBA,  gl.RGBA, gl.UNSIGNED_BYTE, image);
        };

        this.gl.texParameteri( this.gl.TEXTURE_2D,  this.gl.TEXTURE_WRAP_S,  this.gl.MIRRORED_REPEAT);
        this.gl.texParameteri( this.gl.TEXTURE_2D,  this.gl.TEXTURE_WRAP_T,  this.gl.MIRRORED_REPEAT);
        this.gl.texParameteri( this.gl.TEXTURE_2D,  this.gl.TEXTURE_MIN_FILTER,  this.gl.LINEAR);
        this.gl.texParameteri( this.gl.TEXTURE_2D,  this.gl.TEXTURE_MAG_FILTER,  this.gl.LINEAR);
       
        return texture;
    }


    createRenderTargetTexture()
    {

        var targetTexture =  this.gl.createTexture();
        this.gl.bindTexture( this.gl.TEXTURE_2D, targetTexture);
        

        // define size and format of level 0
        const level = 0;
        const internalFormat =  this.gl.RGBA;
        const border = 0;
        const format = this.gl.RGBA;
        const type =  this.gl.UNSIGNED_BYTE;
        const data = null;
        this.gl.texImage2D( this.gl.TEXTURE_2D, level, internalFormat,
            this.textureSize, this.textureSize, border,
            format, type, data);
        

        this.gl.texParameteri( this.gl.TEXTURE_2D,  this.gl.TEXTURE_MIN_FILTER,  this.gl.LINEAR);
        this.gl.texParameteri( this.gl.TEXTURE_2D,  this.gl.TEXTURE_WRAP_S,  this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri( this.gl.TEXTURE_2D,  this.gl.TEXTURE_WRAP_T,  this.gl.CLAMP_TO_EDGE);

        return targetTexture;
    }
    
 

    createCubemapTexture(withMipmaps)
    {
        var targetTexture =  this.gl.createTexture();
        this.gl.bindTexture( this.gl.TEXTURE_CUBE_MAP, targetTexture);
        

        // define size and format of level 0
        const level = 0;
        const internalFormat =  this.gl.RGBA;
        const border = 0;
        const format = this.gl.RGBA;
        const type =  this.gl.UNSIGNED_BYTE;
        const data = null;

        for(var i = 0; i < 6; ++i)
        {
            this.gl.texImage2D(this.gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, level, internalFormat,
                this.textureSize, this.textureSize, border,
                format, type, data);

        } 
        
        if(withMipmaps)
        {
            this.gl.texParameteri( this.gl.TEXTURE_CUBE_MAP,  this.gl.TEXTURE_MIN_FILTER,  this.gl.LINEAR_MIPMAP_LINEAR);
        }
        else
        {
            this.gl.texParameteri( this.gl.TEXTURE_CUBE_MAP,  this.gl.TEXTURE_MIN_FILTER,  this.gl.LINEAR);
        }

        this.gl.texParameteri( this.gl.TEXTURE_CUBE_MAP,  this.gl.TEXTURE_MAG_FILTER,  this.gl.LINEAR);
        this.gl.texParameteri( this.gl.TEXTURE_CUBE_MAP,  this.gl.TEXTURE_WRAP_S,  this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri( this.gl.TEXTURE_CUBE_MAP,  this.gl.TEXTURE_WRAP_T,  this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri( this.gl.TEXTURE_CUBE_MAP,  this.gl.TEXTURE_WRAP_R,  this.gl.CLAMP_TO_EDGE);


        return targetTexture;
    }



    init()
    {
        this.inputTextureID = this.loadTexture("assets/environments/helipad.jpg");

        this.cubemapTextureID = this.createCubemapTexture(true); 

        this.framebuffer = this.gl.createFramebuffer();

        this.lambertianTextureID = this.createCubemapTexture(false); 
        this.ggxTextureID = this.createCubemapTexture(true); 
        this.sheenTextureID = this.createCubemapTexture(true); 


        this.gl.bindTexture(this.gl.TEXTURE_CUBE_MAP, this.ggxTextureID);
        this.gl.generateMipmap(this.gl.TEXTURE_CUBE_MAP);

        this.gl.bindTexture(this.gl.TEXTURE_CUBE_MAP, this.sheenTextureID);
        this.gl.generateMipmap(this.gl.TEXTURE_CUBE_MAP);

    }

    filterAll()
    {
        this.panoramaToCubeMap();
        this.cubeMapToLambertian();
        this.cubeMapToGGX();
        this.cubeMapToSheen();
    }




    panoramaToCubeMap() 
    {
        for(var i = 0; i < 6; ++i)
        {
            this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer);
            var side = i;
            this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_CUBE_MAP_POSITIVE_X+side, this.cubemapTextureID, 0);
  
            this.gl.bindTexture(this.gl.TEXTURE_CUBE_MAP, this.cubemapTextureID);

            this.gl.viewport(0, 0,  this.textureSize,  this.textureSize);  

            this.gl.clearColor(0, 0.0, 0.0, 0.0);   
            this.gl.clear(this.gl.COLOR_BUFFER_BIT| this.gl.DEPTH_BUFFER_BIT);

            const vertexHash = this.shaderCache.selectShader("fullscreen.vert", []);
            const fragmentHash = this.shaderCache.selectShader("panorama_to_cubemap.frag", []);

            this.shader = this.shaderCache.getShaderProgram(fragmentHash, vertexHash);
            this.gl.useProgram(this.shader.program);

            //  TEXTURE0 = active.
            this.gl.activeTexture(this.gl.TEXTURE0+0);

            // Bind texture ID to active texture
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.inputTextureID);
            
            // map shader uniform to texture unit (TEXTURE0)  
            const location = this.gl.getUniformLocation(this.shader.program,"u_panorama");
            this.gl.uniform1i(location, 0); // texture unit 0 (TEXTURE0)  

            this.shader.updateUniform("u_currentFace", i);

            //fullscreen triangle
            this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
        }

        this.gl.bindTexture(this.gl.TEXTURE_CUBE_MAP, this.cubemapTextureID);
        this.gl.generateMipmap(this.gl.TEXTURE_CUBE_MAP);

    }


    applyFilter(
        distribution,
        roughness,
        targetMipLevel,
        targetTexture)
    {
         var currentTextureSize =  this.textureSize>>(targetMipLevel);

        for(var i = 0; i < 6; ++i)
        {

            this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer);
            var side = i;
            this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_CUBE_MAP_POSITIVE_X+side, targetTexture, targetMipLevel);       
        
            this.gl.bindTexture(this.gl.TEXTURE_CUBE_MAP, targetTexture);

            this.gl.viewport(0, 0, currentTextureSize, currentTextureSize);   

            this.gl.clearColor(0, 0.0, 0.0, 0.0);   
            this.gl.clear(this.gl.COLOR_BUFFER_BIT| this.gl.DEPTH_BUFFER_BIT);


            const vertexHash = this.shaderCache.selectShader("fullscreen.vert", []);
            const fragmentHash = this.shaderCache.selectShader("ibl_filtering.frag", []);

            this.shader = this.shaderCache.getShaderProgram(fragmentHash, vertexHash);
            this.gl.useProgram(this.shader.program);

    
            //  TEXTURE0 = active.
            this.gl.activeTexture(this.gl.TEXTURE0+0);

            // Bind texture ID to active texture
            this.gl.bindTexture(this.gl.TEXTURE_CUBE_MAP, this.cubemapTextureID);
            
            // map shader uniform to texture unit (TEXTURE0)  
            const location = this.gl.getUniformLocation(this.shader.program,"u_cubemapTexture");
            this.gl.uniform1i(location, 0); // texture unit 0

            //const roughness =  (currentMipLevel) /  (outputMipLevels - 1);
            const sampleCount = 1024;
            //const currentMipLevel = 0;
            
            const width = this.textureSize;
            const lodBias = 0.0;
            //const distribution = 1;

            this.shader.updateUniform("u_roughness", roughness);
            this.shader.updateUniform("u_sampleCount", sampleCount);
            this.shader.updateUniform("u_currentMipLevel", targetMipLevel);
            this.shader.updateUniform("u_width", width);
            this.shader.updateUniform("u_lodBias", lodBias);
            this.shader.updateUniform("u_distribution", distribution);
            this.shader.updateUniform("u_currentFace", i);


            //fullscreen triangle
            this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
            
        }

    }

    cubeMapToLambertian() 
    {
        this.applyFilter(
            0,
            0.0,
            0,
            this.lambertianTextureID);
    }


    cubeMapToGGX() 
    {
        var outputMipLevels = 11;
        for(var currentMipLevel = 0; currentMipLevel < 6; ++currentMipLevel)
        {
            const roughness =  (currentMipLevel) /  (outputMipLevels - 1);
            this.applyFilter(
                1,
                roughness,
                currentMipLevel,
                this.ggxTextureID);
        }
    }

    cubeMapToSheen() 
    {
        var outputMipLevels = 11;
        for(var currentMipLevel = 0; currentMipLevel < 6; ++currentMipLevel)
        {
            const roughness =  (currentMipLevel) /  (outputMipLevels - 1);
            this.applyFilter(
                2,
                roughness,
                currentMipLevel,
                this.sheenTextureID);
        }
    }


    resize(width, height)
    {
        if (this.currentWidth !== width || this.currentHeight !== height)
        {
            this.canvas.width = width;
            this.canvas.height = height;
            this.currentHeight = height;
            this.currentWidth = width;
            this.gl.viewport(0, 0, width, height);
        }
    }


    drawDebugOutput()
    {
        //render to canvas:
        this.gl.bindFramebuffer(  this.gl.FRAMEBUFFER, null);
        this.gl.viewport(0, 0,  this.gl.canvas.width,  this.gl.canvas.height);

        this.gl.clearColor(0, 0.1, 0.1, 1);   
        this.gl.clear( this.gl.COLOR_BUFFER_BIT|  this.gl.DEPTH_BUFFER_BIT);


        if( this.cubemapTextureID === undefined)
        {
            console.log("cubemapTextureID undefined");
            return;
        }

     
        const vertexHash = this.shaderCache.selectShader("fullscreen.vert", []);
        const fragmentHash = this.shaderCache.selectShader("debug.frag", []);

        if (fragmentHash && vertexHash)
        {
            this.shader = this.shaderCache.getShaderProgram(fragmentHash, vertexHash);
        }

        if (this.shader === undefined)
        {
            console.log("shader program undefined");
            return;
        }

        this.gl.useProgram(this.shader.program);


        //  TEXTURE0 = active.
        this.gl.activeTexture(this.gl.TEXTURE0+0);

        // Bind texture ID to active texture
        // this.gl.bindTexture(this.gl.TEXTURE_2D, this.inputTextureID);
        // this.gl.bindTexture(this.gl.TEXTURE_CUBE_MAP, this.cubemapTextureID);
        //this.gl.bindTexture(this.gl.TEXTURE_CUBE_MAP, this.lambertianTextureID);
        //this.gl.bindTexture(this.gl.TEXTURE_CUBE_MAP, this.ggxTextureID);
        this.gl.bindTexture(this.gl.TEXTURE_CUBE_MAP, this.sheenTextureID);
        
        // map shader uniform to texture unit (TEXTURE0)  
        const location = this.gl.getUniformLocation(this.shader.program,"u_inputTexture");
        this.gl.uniform1i(location, 0); // texture unit 0



        this.shader.updateUniform("u_currentFace", 0);

        //fullscreen triangle
        this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
    }



    drawScene()
    {

        if(this.status == 0) // filtering is done once 
        {
            this.filterAll();
            this.status = 1;
        }

        this.drawDebugOutput();

    }

   

    destroy()
    {
        this.shaderCache.destroy();
    }
}

export { iblSampler };
