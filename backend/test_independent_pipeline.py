import unittest
import numpy as np
from anaglyph_generator import anaglyph_generator

class AdapterTests(unittest.TestCase):
    def test_zero_disparity(self):
        image=np.full((8,16,3),42,dtype=np.uint8)
        depth=np.full((8,16),0.5,dtype=np.float32)
        left,right,lmask,rmask=anaglyph_generator.generate_stereo_with_masks(image,depth,max_disparity_percentage=0)
        np.testing.assert_array_equal(left,image)
        np.testing.assert_array_equal(right,image)
        self.assertFalse(lmask.any())
        self.assertFalse(rmask.any())

    def test_color(self):
        left=np.full((2,2,3),[1,2,200],dtype=np.uint8)
        right=np.full((2,2,3),[30,40,50],dtype=np.uint8)
        np.testing.assert_array_equal(anaglyph_generator.generate_pure_anaglyph(left,right)[0,0],[30,40,200])

if __name__=="__main__":
    unittest.main()
