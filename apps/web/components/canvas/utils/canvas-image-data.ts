/**
 * 来源：vendor/infinite-canvas（tigerowo/infinite-canvas，AGPL-3.0）— D12 画布 v2 移植
 * 图片存储语义已替换：storageKey/localforage → 本项目 assets presign 直传管线（服务端唯一真源）
 */
import { api, type AssetRow } from "@/lib/api";
import { readFileAsDataUrl, readImageMeta } from "@/lib/canvas-image-utils";

export type UploadedImage = {
    url: string;
    assetId: string;
    width: number;
    height: number;
    bytes: number;
    mimeType: string;
};

function assetKindOf(mime: string): AssetRow["kind"] {
    if (mime.startsWith("image/")) return "image";
    if (mime.startsWith("video/")) return "video";
    if (mime.startsWith("audio/")) return "audio";
    return "element";
}

/** presign 直传 + 资产登记，返回服务端 URL 与 assetId */
export async function uploadImageFile(file: File): Promise<UploadedImage> {
    const kind = assetKindOf(file.type);
    const presign = await api<{ url: string; key: string; publicUrl: string }>("/assets/presign", {
        method: "POST",
        body: { filename: file.name, contentType: file.type || "application/octet-stream", kind },
    });
    const put = await fetch(presign.url, { method: "PUT", body: file, headers: { "content-type": file.type || "application/octet-stream" } });
    if (!put.ok) throw new Error(`直传失败 HTTP ${put.status}`);
    const asset = await api<AssetRow>("/assets", {
        method: "POST",
        body: {
            key: presign.key,
            kind,
            mime: file.type || "application/octet-stream",
            sizeBytes: file.size,
            width: null,
            height: null,
            meta: {},
        },
    });
    return {
        url: asset.url,
        assetId: asset.id,
        width: 0,
        height: 0,
        bytes: file.size,
        mimeType: file.type,
    };
}

/** 读取本地图片并上传（附宽高探测） */
export async function uploadLocalImage(file: File): Promise<UploadedImage> {
    const [dataUrl, uploaded] = await Promise.all([readFileAsDataUrl(file), uploadImageFile(file)]);
    const meta = await readImageMeta(dataUrl);
    return { ...uploaded, width: meta.width, height: meta.height, mimeType: meta.mimeType || file.type };
}

export function imageMetadata(image: UploadedImage) {
    return {
        content: image.url,
        assetId: image.assetId,
        status: "success" as const,
        naturalWidth: image.width,
        naturalHeight: image.height,
        bytes: image.bytes,
        mimeType: image.mimeType,
    };
}
