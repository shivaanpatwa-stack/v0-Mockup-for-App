import geopandas as gpd, json
z = gpd.read_file("data/zones_full_features_final.geojson").to_crs(32643)
pts = z.geometry.representative_point().to_crs(4326)   # a point guaranteed inside each ward
out = {w: {"lat": p.y, "lng": p.x} for w, p in zip(z["ward_code"], pts)}
json.dump(out, open("data/ward_centroids.json", "w"), indent=2)
print(len(out), "wards")   # expect 24