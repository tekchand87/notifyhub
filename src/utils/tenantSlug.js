export const normalizeTenantSlug = (value) =>{
  const slug = value
  .toString()
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .replace(/-+/g, "-");

  return slug;
};

export const buildTenantSlug = (name)=>{
  const slug = normalizeTenantSlug(name);

  if(!slug){
    throw new Error("Unable to generate a valid tenant slug");
  }
  return slug;
};