import * as authService from "./auth.service.js"

export const register = async (req,res,next)=>{
  try{
    const result = await authService.register(req.body);
    return res.status(201).json({
      success : true,
      message : "Registration successful",
      data : result
    });
  }catch(error){
    next(error)
  }
}

export const login = async(req,res,next)=>{
  try{
    const result = await authService.login(req.body);

    return res.status(200).json({
      success : true,
      message : " Login successfull",
      data : result 
    });
  }catch(error){
    next(error);
  }
};

export const getMe = async(req,res,next)=>{
  try{
    const user = await authService.getCurrentUser(req.user._id)

    return res.status(200).json({
      success : true,
      message : "Current user fetch successfully",
      data : {user}
  });
  }catch(error){
    next(error);
  }
};

export const changePassword = async(req,res,next)=>{
  try{
    const result = await authService.changePassword(req.user._id,req.body.currentPassword,req.body.newPassword);

    return res.status(200).json({
      success : true,
      result
    });
  }catch(error){
    next(error);
  }
}