using DAFL.Backend.Common;
using DAFL.Backend.Infrastructure.Data;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace DAFL.Backend.Features.Admin;

// ---------- Đánh giá sản phẩm — quản trị (đợt 16) ----------
// Entity Evaluation KHÔNG có cờ IsHidden/IsDeleted nên xóa đánh giá là XÓA CỨNG:
// bản ghi biến mất khỏi DB, không khôi phục được (khác xóa mềm sản phẩm/danh mục).

public record AdminEvaluationDto(
    Guid Id, Guid ProductId, string ProductName, Guid? UserId, string UserName,
    int Rating, string Comment, DateTime CreatedAt);

public record ListEvaluationsQuery(Guid? ProductId, int? Rating, string? Search, int Page = 1, int PageSize = 10)
    : IRequest<ApiResponse<List<AdminEvaluationDto>>>;

public class ListEvaluationsQueryHandler : IRequestHandler<ListEvaluationsQuery, ApiResponse<List<AdminEvaluationDto>>>
{
    private readonly AppDbContext _db;
    public ListEvaluationsQueryHandler(AppDbContext db) => _db = db;

    public async Task<ApiResponse<List<AdminEvaluationDto>>> Handle(ListEvaluationsQuery request, CancellationToken ct)
    {
        var query = _db.Evaluations.AsNoTracking().AsQueryable();
        if (request.ProductId.HasValue)
            query = query.Where(e => e.ProductId == request.ProductId.Value);
        if (request.Rating.HasValue)
            query = query.Where(e => e.Rating == request.Rating.Value);
        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var s = request.Search.Trim().ToLower();
            query = query.Where(e => (e.Product != null && e.Product.Name.ToLower().Contains(s))
                || e.UserName.ToLower().Contains(s)
                || e.Comment.ToLower().Contains(s));
        }
        var page = Math.Max(1, request.Page);
        var pageSize = Math.Clamp(request.PageSize, 1, 100);
        var evaluations = await query.OrderByDescending(e => e.CreatedAt)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(e => new AdminEvaluationDto(e.Id, e.ProductId,
                e.Product == null ? string.Empty : e.Product.Name,
                e.UserId, e.UserName, e.Rating, e.Comment, e.CreatedAt))
            .ToListAsync(ct);
        return ApiResponse<List<AdminEvaluationDto>>.Ok(evaluations);
    }
}

public record DeleteEvaluationCommand(Guid Id) : IRequest<ApiResponse<string>>;

public class DeleteEvaluationCommandHandler : IRequestHandler<DeleteEvaluationCommand, ApiResponse<string>>
{
    private readonly AppDbContext _db;
    public DeleteEvaluationCommandHandler(AppDbContext db) => _db = db;

    public async Task<ApiResponse<string>> Handle(DeleteEvaluationCommand request, CancellationToken ct)
    {
        var evaluation = await _db.Evaluations.FirstOrDefaultAsync(e => e.Id == request.Id, ct);
        if (evaluation == null) return ApiResponse<string>.Fail("Không tìm thấy đánh giá.");

        // Nạp sản phẩm kèm danh sách đánh giá để tính lại Rating/ReviewCount sau khi xóa
        // (cùng cách AddEvaluationCommandHandler tính lại khi thêm: Count + Average làm tròn 1 số).
        var product = await _db.Products
            .Include(p => p.Evaluations)
            .FirstOrDefaultAsync(p => p.Id == evaluation.ProductId, ct);

        _db.Evaluations.Remove(evaluation);
        if (product != null)
        {
            // Gỡ khỏi collection đang track để Count/Average không tính bản ghi vừa xóa.
            product.Evaluations.Remove(evaluation);
            product.ReviewCount = product.Evaluations.Count;
            // Product.Rating là double (không nullable, mặc định 5.0): hết đánh giá thì về 0,
            // vì Average() trên tập rỗng sẽ ném InvalidOperationException.
            product.Rating = product.Evaluations.Count == 0
                ? 0
                : Math.Round(product.Evaluations.Average(e => e.Rating), 1);
        }

        await _db.SaveChangesAsync(ct);
        return ApiResponse<string>.Ok("Đã xóa đánh giá.");
    }
}
