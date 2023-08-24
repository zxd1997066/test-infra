import torch

a = torch.tensor([[12.0, -51, 4], [6, 167, -68], [-4, 24, -41]])
old_q, old_r = torch.qr(a)
new_q, new_r = torch.linalg.qr(a)
assert torch.allclose(old_q, new_q)
assert torch.allclose(old_r, new_r)

a = torch.randn(3, 4, 5)
old_q, old_r = torch.qr(a, some=False)
new_q, new_r = torch.linalg.qr(a, mode="complete")
assert torch.allclose(old_q, new_q)
assert torch.allclose(old_r, new_r)

a = torch.randn(3, 4, 5)
old_q, old_r = torch.qr(a, some=True)
new_q, new_r = torch.linalg.qr(a)
assert torch.allclose(old_q, new_q)
assert torch.allclose(old_r, new_r)
