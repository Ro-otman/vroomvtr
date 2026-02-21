export const SITE_NAME = "VroomVTR";
export const SITE_URL = (
  process.env.SITE_URL || "http://localhost:3000"
).replace(/\/$/, "");

export const buildMeta = ({ title, description, path, image }) => {
  const url = `${SITE_URL}${path}`;
  const defaultImage = `${SITE_URL}/images/car-meta-icon.svg`;
  const imageUrl = image
    ? image.startsWith("http")
      ? image
      : `${SITE_URL}${image}`
    : defaultImage;
  return {
    siteName: SITE_NAME,
    title,
    description,
    canonical: url,
    robots: "index,follow",
    og: {
      title,
      description,
      url,
      image: imageUrl,
      type: "website",
      siteName: SITE_NAME,
    },
    twitter: {
      title,
      description,
      url,
      image: imageUrl,
      card: "summary_large_image",
    },
  };
};
