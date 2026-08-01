import { supabase } from "./supabase";

/**
 * Compresses an image file using browser Canvas API
 * Downscales image if width or height exceeds 1200px, preserves aspect ratio
 * Outputs a compressed JPEG blob at 0.75 quality
 */
export async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          return reject(new Error("Failed to get canvas 2D context"));
        }

        const MAX_WIDTH = 1200;
        const MAX_HEIGHT = 1200;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width = Math.round((width * MAX_HEIGHT) / height);
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error("Canvas blob conversion failed"));
            }
          },
          "image/jpeg",
          0.75
        );
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}

/**
 * Uploads a compressed blob or file to Supabase Storage in 'incident-images' bucket
 * Returns the public URL of the uploaded image
 */
export async function uploadImageToSupabase(
  fileBlob: Blob | File,
  filename: string,
  onProgress?: (percent: number) => void
): Promise<string> {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  // Generate a unique filename using UUID
  const uniqueName = `reports/img-${crypto.randomUUID()}-${filename.replace(/[^a-zA-Z0-9.]/g, "_")}`;

  const { error } = await supabase.storage
    .from("incident-images")
    .upload(uniqueName, fileBlob, {
      cacheControl: "3600",
      upsert: false,
      // Pass the progress handler if available in current client libraries
      onUploadProgress: (progressEvent: any) => {
        if (progressEvent && onProgress) {
          const percent = Math.round((progressEvent.loaded / progressEvent.total) * 100);
          onProgress(percent);
        }
      }
    } as any); // cast since types might vary between supabase client versions

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  // Retrieve public URL
  const { data } = supabase.storage.from("incident-images").getPublicUrl(uniqueName);
  if (!data?.publicUrl) {
    throw new Error("Failed to resolve public URL for uploaded file.");
  }

  return data.publicUrl;
}
