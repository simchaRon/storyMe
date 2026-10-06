// No imports on purpose: the tests load this file with plain Node.

/**
 * The text a person reads aloud to make a voice sample. English on purpose: cloned voices read English.
 * It is calm, has questions, whispers and a few different sounds, and takes 30 to 50 seconds to read.
 */
export const VOICE_SAMPLE_SCRIPT = [
  'Once upon a time, in a quiet little town by the sea, there lived a girl named Lily who loved the night sky.',
  'Every evening, she climbed up to the roof, wrapped herself in a soft blue blanket, and counted the stars one by one.',
  '"One, two, three," she whispered. The moon smiled down at her, big and round and bright.',
  'A gentle breeze danced through the trees, and the waves hummed a quiet song.',
  'When her eyes grew heavy, Lily whispered, "Good night, moon. Good night, stars."',
  'And the whole world answered with a soft, sleepy hush.',
].join('\n\n');
