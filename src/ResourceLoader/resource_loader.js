import axios from '../../libs/axios.min.js';
import { glTF } from '../gltf.js';
import { getIsGlb, getContainingFolder } from '../utils.js';
import { GlbParser } from '../glb_parser.js';
import { gltfLoader } from "../loader";
import { gltfImage, ImageMimeType } from "../image";
import { gltfTexture } from '../texture.js';
import { gltfSampler } from '../sampler.js';
import { WebGl } from '../webgl.js';

import { AsyncFileReader } from './async_file_reader.js';

async function loadGltf(path, json, buffers, view, ktxDecoder, dracoDecoder)
{
    const gltf = new glTF(path);
    gltf.ktxDecoder = ktxDecoder;
    gltf.dracoDecoder = dracoDecoder;
    gltf.fromJson(json);

    // because the gltf image paths are not relative
    // to the gltf, we have to resolve all image paths before that
    for (const image of gltf.images)
    {
        image.resolveRelativePath(getContainingFolder(gltf.path));
    }

    await gltfLoader.load(gltf, view.context, buffers);

    return gltf;
}

async function loadGltfFromDrop(mainFile, additionalFiles, view, ktxDecoder, dracoDecoder)
{
    const gltfFile = mainFile.name;

    if (getIsGlb(gltfFile))
    {
        const data = await AsyncFileReader.readAsArrayBuffer(mainFile);
        const glbParser = new GlbParser(data);
        const glb = glbParser.extractGlbData();
        return await loadGltf(gltfFile, glb.json, glb.buffers, view, ktxDecoder, dracoDecoder);
    }
    else
    {
        const data = await AsyncFileReader.readAsText(mainFile);
        const json = JSON.parse(data);
        return await loadGltf(gltfFile, json, additionalFiles, view, ktxDecoder, dracoDecoder);
    }
}

async function loadGltfFromPath(path, view, ktxDecoder, dracoDecoder)
{
    const isGlb = getIsGlb(path);

    let response = await axios.get(path, { responseType: isGlb ? "arraybuffer" : "json" });

    let json = response.data;
    let buffers = undefined;

    if (isGlb)
    {
        const glbParser = new GlbParser(response.data);
        const glb = glbParser.extractGlbData();
        json = glb.json;
        buffers = glb.buffers;
    }

    return await loadGltf(path, json, buffers, view, ktxDecoder, dracoDecoder);
}

async function loadPrefilteredEnvironmentFromPath(filteredEnvironmentsDirectoryPath, view, ktxDecoder)
{
    // The environment uses the same type of samplers, textures and images as used in the glTF class
    // so we just use it as a template
    // TODO: replace this with a custom environment map type
    const environment = new glTF();
    environment.ktxDecoder = ktxDecoder;

    //
    // Prepare samplers.
    //

    let samplerIdx = environment.samplers.length;

    environment.samplers.push(new gltfSampler(WebGL2RenderingContext.LINEAR, WebGL2RenderingContext.LINEAR, WebGL2RenderingContext.CLAMP_TO_EDGE, WebGL2RenderingContext.CLAMP_TO_EDGE, "DiffuseCubeMapSampler"));
    const diffuseCubeSamplerIdx = samplerIdx++;

    environment.samplers.push(new gltfSampler(WebGL2RenderingContext.LINEAR, WebGL2RenderingContext.LINEAR_MIPMAP_LINEAR, WebGL2RenderingContext.CLAMP_TO_EDGE, WebGL2RenderingContext.CLAMP_TO_EDGE, "SpecularCubeMapSampler"));
    const specularCubeSamplerIdx = samplerIdx++;

    environment.samplers.push(new gltfSampler(WebGL2RenderingContext.LINEAR, WebGL2RenderingContext.LINEAR_MIPMAP_LINEAR, WebGL2RenderingContext.CLAMP_TO_EDGE, WebGL2RenderingContext.CLAMP_TO_EDGE, "SheenCubeMapSampler"));
    const sheenCubeSamplerIdx = samplerIdx++;

    environment.samplers.push(new gltfSampler(WebGL2RenderingContext.LINEAR, WebGL2RenderingContext.LINEAR, WebGL2RenderingContext.CLAMP_TO_EDGE, WebGL2RenderingContext.CLAMP_TO_EDGE, "LUTSampler"));
    const lutSamplerIdx = samplerIdx++;

    //
    // Prepare images and textures.
    //

    let textureIdx = environment.images.length;

    // Diffuse

    const lambertian = new gltfImage(filteredEnvironmentsDirectoryPath + "/lambertian/diffuse.ktx2", WebGL2RenderingContext.TEXTURE_CUBE_MAP);
    lambertian.mimeType = ImageMimeType.KTX2;
    environment.images.push(lambertian);
    environment.textures.push(new gltfTexture(diffuseCubeSamplerIdx, [textureIdx++], WebGL2RenderingContext.TEXTURE_CUBE_MAP));

    // Specular

    const specular = new gltfImage(filteredEnvironmentsDirectoryPath + "/ggx/specular.ktx2", WebGL2RenderingContext.TEXTURE_CUBE_MAP);
    specular.mimeType = ImageMimeType.KTX2;
    environment.images.push(specular);
    environment.textures.push(new gltfTexture(specularCubeSamplerIdx, [textureIdx++], WebGL2RenderingContext.TEXTURE_CUBE_MAP));

    // Sheen

    const sheen = new gltfImage(filteredEnvironmentsDirectoryPath + "/charlie/sheen.ktx2", WebGL2RenderingContext.TEXTURE_CUBE_MAP);
    sheen.mimeType = ImageMimeType.KTX2;
    environment.images.push(sheen);
    environment.textures.push(new gltfTexture(sheenCubeSamplerIdx, [textureIdx++], WebGL2RenderingContext.TEXTURE_CUBE_MAP));

    //
    // Look Up Tables.
    //

    // GGX

    environment.images.push(new gltfImage("assets/images/lut_ggx.png", WebGL2RenderingContext.TEXTURE_2D));
    environment.textures.push(new gltfTexture(lutSamplerIdx, [textureIdx++], WebGL2RenderingContext.TEXTURE_2D));

    // Sheen
    // Charlie
    environment.images.push(new gltfImage("assets/images/lut_charlie.png", WebGL2RenderingContext.TEXTURE_2D));
    environment.textures.push(new gltfTexture(lutSamplerIdx, [textureIdx++], WebGL2RenderingContext.TEXTURE_2D));
    // Sheen E LUT
    environment.images.push(new gltfImage("assets/images/lut_sheen_E.png", WebGL2RenderingContext.TEXTURE_2D));
    environment.textures.push(new gltfTexture(lutSamplerIdx, [textureIdx++], WebGL2RenderingContext.TEXTURE_2D));

    await gltfLoader.loadImages(environment).then(() => gltfLoader.processImages(environment));

    environment.initGl(view.context);

    return environment;
}

export { loadGltfFromPath, loadGltfFromDrop, loadPrefilteredEnvironmentFromPath };
