import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

/**
 * ManagePropertyImages.js
 *
 * Purpose:
 * - Manage images for a property after property creation/edit.
 * - Supports:
 *   1. Load existing property images
 *   2. Upload multiple images
 *   3. Delete image
 *   4. Set cover image
 *   5. Show cover badge
 *
 * Backend APIs used:
 * - GET    /properties/:id/images
 * - POST   /properties/:id/images              form-data key: images
 * - DELETE /properties/:propertyId/images/:imageId
 * - PATCH  /properties/:propertyId/images/:imageId/cover
 */

const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

function ManagePropertyImages() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [images, setImages] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  /**
   * Safely get token from localStorage.
   * This keeps compatibility with protected backend APIs.
   */
  const token = localStorage.getItem("token");

  /**
   * Common auth headers.
   * Do not set Content-Type for FormData upload.
   */
  const authHeaders = token
    ? {
        Authorization: `Bearer ${token}`,
      }
    : {};

  /**
   * Fetch all images for current property.
   */
  const fetchImages = async () => {
    try {
      setLoading(true);

      const response = await fetch(`${API_BASE_URL}/properties/${id}/images`, {
        method: "GET",
        headers: {
          ...authHeaders,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to load property images");
      }

      /**
       * Defensive handling:
       * Backend may return:
       * - array directly
       * - { images: [...] }
       * - { data: [...] }
       */
      const imageList = Array.isArray(data)
        ? data
        : data.images || data.data || [];

      setImages(imageList);
    } catch (error) {
      console.error("Fetch images error:", error);
      alert(error.message || "Unable to load images");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchImages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  /**
   * Store selected multiple files.
   */
  const handleFileChange = (event) => {
    setSelectedFiles(Array.from(event.target.files || []));
  };

  /**
   * Upload multiple images.
   *
   * Backend expects:
   * POST /properties/:id/images
   * form-data key: images
   */
  const handleUploadImages = async () => {
    if (selectedFiles.length === 0) {
      alert("Please select at least one image.");
      return;
    }

    try {
      setUploading(true);

      const formData = new FormData();

      selectedFiles.forEach((file) => {
        formData.append("images", file);
      });

      const response = await fetch(`${API_BASE_URL}/properties/${id}/images`, {
        method: "POST",
        headers: {
          ...authHeaders,
        },
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Image upload failed");
      }

      alert("Images uploaded successfully.");

      setSelectedFiles([]);

      /**
       * Reset file input manually.
       */
      const fileInput = document.getElementById("property-images-input");
      if (fileInput) {
        fileInput.value = "";
      }

      fetchImages();
    } catch (error) {
      console.error("Upload images error:", error);
      alert(error.message || "Unable to upload images");
    } finally {
      setUploading(false);
    }
  };

  /**
   * Delete selected image.
   */
  const handleDeleteImage = async (imageId) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this image?"
    );

    if (!confirmDelete) return;

    try {
      const response = await fetch(
        `${API_BASE_URL}/properties/${id}/images/${imageId}`,
        {
          method: "DELETE",
          headers: {
            ...authHeaders,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to delete image");
      }

      alert("Image deleted successfully.");
      fetchImages();
    } catch (error) {
      console.error("Delete image error:", error);
      alert(error.message || "Unable to delete image");
    }
  };

  /**
   * Mark selected image as cover image.
   */
  const handleSetCoverImage = async (imageId) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/properties/${id}/images/${imageId}/cover`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to set cover image");
      }

      alert("Cover image updated successfully.");
      fetchImages();
    } catch (error) {
      console.error("Set cover image error:", error);
      alert(error.message || "Unable to set cover image");
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Manage Property Images</h2>
          <p style={styles.subtitle}>
            Upload, delete, and select cover image for property ID: {id}
          </p>
        </div>

        <button
          type="button"
          style={styles.secondaryButton}
          onClick={() => navigate("/my-properties")}
        >
          Back to My Properties
        </button>
      </div>

      <div style={styles.uploadCard}>
        <h3 style={styles.sectionTitle}>Upload Images</h3>

        <input
          id="property-images-input"
          type="file"
          multiple
          accept="image/*"
          onChange={handleFileChange}
          style={styles.fileInput}
        />

        {selectedFiles.length > 0 && (
          <p style={styles.selectedText}>
            {selectedFiles.length} image(s) selected
          </p>
        )}

        <button
          type="button"
          style={styles.primaryButton}
          onClick={handleUploadImages}
          disabled={uploading}
        >
          {uploading ? "Uploading..." : "Upload Images"}
        </button>
      </div>

      <div style={styles.gallerySection}>
        <h3 style={styles.sectionTitle}>Image Gallery</h3>

        {loading ? (
          <p>Loading images...</p>
        ) : images.length === 0 ? (
          <p style={styles.emptyText}>No images uploaded yet.</p>
        ) : (
          <div style={styles.galleryGrid}>
            {images.map((image) => {
              const imageId = image.image_id || image.id;
              const imageUrl = image.image_url || image.url;
              const isCover = image.is_cover === true;

              return (
                <div key={imageId} style={styles.imageCard}>
                  <div style={styles.imageWrapper}>
                    <img
                      src={imageUrl}
                      alt="Property"
                      style={styles.image}
                    />

                    {isCover && <span style={styles.coverBadge}>Cover</span>}
                  </div>

                  <div style={styles.actionRow}>
                    {!isCover && (
                      <button
                        type="button"
                        style={styles.coverButton}
                        onClick={() => handleSetCoverImage(imageId)}
                      >
                        Set Cover
                      </button>
                    )}

                    <button
                      type="button"
                      style={styles.deleteButton}
                      onClick={() => handleDeleteImage(imageId)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Inline styles used to avoid dependency on CSS file.
 * Later we can move this to ManagePropertyImages.css.
 */
const styles = {
  page: {
    padding: "24px",
    maxWidth: "1200px",
    margin: "0 auto",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: "16px",
    alignItems: "center",
    marginBottom: "24px",
  },
  title: {
    margin: 0,
    fontSize: "26px",
  },
  subtitle: {
    marginTop: "6px",
    color: "#666",
  },
  uploadCard: {
    border: "1px solid #ddd",
    borderRadius: "10px",
    padding: "20px",
    marginBottom: "28px",
    background: "#fff",
  },
  sectionTitle: {
    marginTop: 0,
    marginBottom: "16px",
  },
  fileInput: {
    display: "block",
    marginBottom: "12px",
  },
  selectedText: {
    color: "#555",
    marginBottom: "12px",
  },
  primaryButton: {
    background: "#2563eb",
    color: "#fff",
    border: "none",
    padding: "10px 16px",
    borderRadius: "6px",
    cursor: "pointer",
  },
  secondaryButton: {
    background: "#f3f4f6",
    color: "#111",
    border: "1px solid #ccc",
    padding: "10px 16px",
    borderRadius: "6px",
    cursor: "pointer",
  },
  gallerySection: {
    marginTop: "20px",
  },
  galleryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
    gap: "18px",
  },
  imageCard: {
    border: "1px solid #ddd",
    borderRadius: "10px",
    overflow: "hidden",
    background: "#fff",
  },
  imageWrapper: {
    position: "relative",
    width: "100%",
    height: "170px",
    background: "#f5f5f5",
  },
  image: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  coverBadge: {
    position: "absolute",
    top: "10px",
    left: "10px",
    background: "#16a34a",
    color: "#fff",
    padding: "4px 8px",
    borderRadius: "20px",
    fontSize: "12px",
    fontWeight: "bold",
  },
  actionRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "10px",
    padding: "12px",
  },
  coverButton: {
    background: "#f59e0b",
    color: "#fff",
    border: "none",
    padding: "8px 10px",
    borderRadius: "6px",
    cursor: "pointer",
    flex: 1,
  },
  deleteButton: {
    background: "#dc2626",
    color: "#fff",
    border: "none",
    padding: "8px 10px",
    borderRadius: "6px",
    cursor: "pointer",
    flex: 1,
  },
  emptyText: {
    color: "#666",
  },
};

export default ManagePropertyImages;