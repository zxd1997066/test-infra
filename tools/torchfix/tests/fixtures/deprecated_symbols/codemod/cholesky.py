import torch

A = torch.randn(2, 2, dtype=torch.complex128)
A = A @ A.T.conj() + torch.eye(2)
old = torch.cholesky(A)
new = torch.linalg.cholesky(A)
assert torch.allclose(old, new)

A = torch.randn(2, 2, dtype=torch.complex128)
A = A @ A.T.conj() + torch.eye(2)
old = torch.cholesky(A, False)
new = torch.linalg.cholesky(A)
assert torch.allclose(old, new)

A = torch.randn(3, 3)
A = A @ A.mT + 1e-3
old = torch.cholesky(A, upper=True)
new = torch.linalg.cholesky(A).mH
assert torch.allclose(old, new)

A = torch.randn(3, 3)
A = A @ A.mT + 1e-3
old = torch.cholesky(A, True)
new = torch.linalg.cholesky(A).mH
assert torch.allclose(old, new)
