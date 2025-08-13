import { useState, useEffect } from "react";

function ClothDetailPanel({ cloth, onUpdate, onDelete }) {
  const [editMode, setEditMode] = useState(false);

  const [form, setForm] = useState({
    name: "",
    description: "",
    style: "casual",
    category: "top",
    size: "M",
    subCategory: "",
    color: "",
  });

  // cloth가 바뀔 때마다 form 초기화
  useEffect(() => {
  if (!cloth || !cloth._id) return;

  const clothColorString = (cloth.color || []).join(", ");
  const newForm = {
    name: cloth.name || "",
    description: cloth.description || "",
    style: cloth.style || "casual",
    category: cloth.category || "top",
    subCategory: cloth.subCategory,
    size: cloth.size || "M",
    color: clothColorString,
  };

  
  setForm(newForm);
  setEditMode(false);
}, [cloth?._id]); // <- 이게 핵심!


  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSave = async () => {
    const token = localStorage.getItem("token");

    const updatedData = {
      ...form,
      color: form.color
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean),
    };

    const res = await fetch(`http://15.165.129.131:3000/api/cloth/${cloth._id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(updatedData),
    });

    if (res.ok) {
      const result = await res.json();
        const updated = result.data;  // ✅ data 안에 있는 cloth 꺼냄
        onUpdate(updated);
        setEditMode(false);
    } else {
      alert("수정 실패");
    }
  };

  const handleDelete = async () => {
    const token = localStorage.getItem("token");
    const res = await fetch(`http://15.165.129.131:3000/api/cloth/${cloth._id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (res.ok) {
      onDelete(cloth._id);
    } else {
      alert("삭제 실패");
    }
  };

  if (!cloth) {
    return (
      <div className="closet-detail-panel">
        <p className="closet-placeholder">CLICK YOUR CLOTH</p>
      </div>
    );
  }

  return (
    <div className="closet-detail-panel">
      <div className="closet-detail-panel-content">
      <img
        src={`http://15.165.129.131:3000${cloth.imageUrl}`}
        alt="옷 이미지"
        className="detail-image"
      />

      {editMode ? (
        <form className="descriptionModify" onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
          <label>NAME</label>
          <input name="name" value={form.name} onChange={handleChange} className="detail-input" />

          <label>DESCRIPTION</label>
          <input name="description" value={form.description} onChange={handleChange} className="detail-input" />

          <label>STYLE</label>
          <select name="style" value={form.style} onChange={handleChange} className="detail-input">
            <option value="casual">CASUAL</option>
            <option value="formal">FORMAL</option>
            <option value="sporty">SPORTY</option>
            <option value="street">STREET</option>
            <option value="other">ETC</option>
          </select>

          <label>CATEGORY</label>
          <select name="category" value={form.category} onChange={handleChange} className="detail-input">
            <option value="top">TOP</option>
            <option value="bottom">BOTTOM</option>
          </select>

          <label>KIND</label>
          {form.category== "top"? <select name="subCategory" value={form.subCategory} onChange={handleChange} className="detail-input">
            <option value="T-shirt">T-shirt</option>
            <option value="Shirt">Shirt</option>
            <option value="Sweatshirt">Sweatshirt</option>
            <option value="Hoodie">Hoodie</option>
          </select> : 
          <select name="subCategory" value={form.subCategory} onChange={handleChange} className="detail-input">
            <option value="Pants">Pants</option>
            <option value="Shorts">Shorts</option>
            <option value="Skirt">Skirt</option>
          </select>
          
          }


          <label>SIZE</label>
          <select name="size" value={form.size} onChange={handleChange} className="detail-input">
            <option value="XS">XS</option>
            <option value="S">S</option>
            <option value="M">M</option>
            <option value="L">L</option>
            <option value="XL">XL</option>
            <option value="2XL">2XL</option>
          </select>

          <label>COLOR</label>
          <input
            name="color"
            value={form.color}
            onChange={handleChange}
            className="detail-input"
            placeholder="white, black"
          />
          <div className="buttonsModify">
          <button type="submit" className="detail-button save">SAVE</button>
          </div>
        </form>
      ) : (
        <div className="panel">
          <div className="description">
            <div><span>NAME</span> <span>{form.name || "-"}</span></div>
            <div><span>DESCRIPTION</span> <span>{form.description || "-"}</span></div>
            <div><span>STYLE</span> <span>{form.style}</span></div>
            <div><span>CATEGORY</span> <span>{form.category}</span></div>
            <div><span>KIND</span> <span>{form.subCategory}</span></div>
            <div><span>SIZE</span> <span>{form.size}</span></div>
            <div><span>COLOR</span> <span>{form.color}</span></div>
          </div>
          <div className="buttons">
            <button onClick={() => setEditMode(true)} className="detail-button">MODIFY</button>
            <button onClick={handleDelete} className="detail-button delete">DELETE</button>
          </div>
        </div>
      )}

     </div>
    </div>
  );
}

export default ClothDetailPanel;
