/**
 * Factor de costo para el hashing de contraseñas con bcrypt.
 * Centralizado aquí para evitar valores mágicos repetidos en varios services.
 */
export const BCRYPT_SALT_ROUNDS = 10;
