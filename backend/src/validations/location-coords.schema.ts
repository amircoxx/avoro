import { z } from "zod";

function coordinateQueryParameter(minimum: number, maximum: number) {
  return z
    .string()
    .trim()
    .min(1)
    .transform(Number)
    .pipe(z.number().finite().min(minimum).max(maximum));
}

export const locationCoordsQuerySchema = z.object({
  lat: coordinateQueryParameter(-90, 90),
  lng: coordinateQueryParameter(-180, 180)
});

export type LocationCoordsQuery = z.infer<
  typeof locationCoordsQuerySchema
>;
